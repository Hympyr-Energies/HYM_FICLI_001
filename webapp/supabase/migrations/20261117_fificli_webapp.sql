-- Cockpit appels (webapp) : membres, tickets, classeur clients et fonctions d'enregistrement.
--
-- MIGRATION ADDITIVE : elle ne modifie ni ne supprime aucune table existante (suivi, suivi_adresses, appels, journal,
-- historique, verrous, meta, fichiers). L'ancien outil Streamlit et la webapp peuvent donc fonctionner en parallèle
-- sur les mêmes données pendant la transition. Les horodatages restent des chaînes ISO en UTC, comme l'existant.
--
-- Accès : tout passe par la fonction Edge « fificli-api » (clé serveur). Les nouvelles tables sont protégées par RLS
-- sans politique ; seules les fonctions ci-dessous, réservées au rôle service_role, y écrivent.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Membres : un compte Supabase Authentication + une ligne ici = un accès à l'outil
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.fificli_membres (
    email    text primary key,
    nom      text not null,                                            -- identique à la valeur « traite_par » des fiches (ex. Chloé)
    role     text not null check (role in ('commercial', 'manager', 'admin')),
    actif    boolean not null default true,
    cree_le  timestamptz not null default now()
);
create unique index if not exists fificli_membres_nom_uniq on public.fificli_membres (lower(nom));

create or replace function public.fificli_membres_normaliser()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.email := lower(btrim(new.email));
    new.nom   := btrim(new.nom);
    if position('@' in new.email) < 2 then
        raise exception 'Adresse e-mail invalide : %', new.email using errcode = '22023';
    end if;
    if new.nom = '' then
        raise exception 'Le nom est obligatoire' using errcode = '22023';
    end if;
    return new;
end;
$$;
drop trigger if exists fificli_membres_normaliser on public.fificli_membres;
create trigger fificli_membres_normaliser before insert or update on public.fificli_membres
    for each row execute function public.fificli_membres_normaliser();

alter table public.fificli_membres enable row level security;
revoke all on public.fificli_membres from public, anon, authenticated;
grant select on public.fificli_membres to service_role;
comment on table public.fificli_membres is 'Membres autorisés du cockpit appels : e-mail du compte Supabase Authentication, nom affiché (= traite_par), rôle.';

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Tickets : demandes d'aide, anomalies et suggestions envoyées depuis l'outil
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.fificli_tickets (
    id            bigint generated always as identity primary key,
    cree_le       timestamptz not null default now(),
    auteur_email  text not null,
    auteur_nom    text not null default '',
    type          text not null check (type in ('probleme', 'suggestion', 'question')),
    sujet         text not null check (char_length(sujet) between 3 and 140),
    message       text not null check (char_length(message) between 3 and 4000),
    page          text not null default '',                              -- écran ouvert au moment de l'envoi
    contexte      jsonb not null default '{}'::jsonb,                    -- navigateur, fiche ouverte, version de l'outil
    statut        text not null default 'nouveau' check (statut in ('nouveau', 'en_cours', 'traite', 'clos')),
    reponse       text not null default '',
    traite_par    text not null default '',
    maj_le        timestamptz not null default now()
);
create index if not exists fificli_tickets_statut on public.fificli_tickets (statut, cree_le desc);
create index if not exists fificli_tickets_auteur on public.fificli_tickets (auteur_email, cree_le desc);

alter table public.fificli_tickets enable row level security;
revoke all on public.fificli_tickets from public, anon, authenticated;
grant select, insert, update on public.fificli_tickets to service_role;
comment on table public.fificli_tickets is 'Tickets envoyés par les membres depuis le cockpit appels.';

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Classeur clients : la feuille « Clients » et la feuille « Adresses livraison » du fichier mère, en base
--    (jusqu'ici elles n'existaient que dans le fichier binaire de la table « fichiers »).
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.fificli_classeur (
    cle          text primary key check (cle in ('clients', 'adresses', 'clients_import', 'adresses_import')),
    version      bigint not null default 1,
    nom_fichier  text not null default '',
    importe_le   timestamptz not null default now(),
    importe_par  text not null default '',
    colonnes     jsonb not null default '[]'::jsonb,
    lignes       jsonb not null default '[]'::jsonb
);
alter table public.fificli_classeur enable row level security;
revoke all on public.fificli_classeur from public, anon, authenticated;
grant select on public.fificli_classeur to service_role;
comment on table public.fificli_classeur is 'Classeur clients normalisé : colonnes + lignes (tableaux). Les clés *_import servent de zone de transit.';

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Fonctions d'écriture (une transaction chacune) — réservées à la fonction Edge
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.fificli_maintenant()
returns text language sql stable set search_path = '' as $$
    select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS');
$$;

-- Enregistre une fiche client sans jamais remplacer une information déjà saisie par du vide, sauf effacement demandé
-- explicitement (même règle que l'ancien outil). Écrit la version dans « historique » et l'appel dans « appels ».
create or replace function public.fificli_enregistrer_fiche(
    p_code text, p_utilisateur text, p_champs jsonb, p_effacements text[] default '{}', p_journaliser boolean default true)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    v_protege text[] := array['existe','produits','email_maj','tel_maj','note','doublon_de','rappel_date','motif_sortie'];
    v_permis  text[] := array['statut','existe','produits','email_maj','tel_maj','note','doublon_de','rappel_date','motif_sortie'];
    v_efface  text[] := coalesce(p_effacements, '{}');
    v_now     text := public.fificli_maintenant();
    v_old     jsonb;
    v_new     jsonb;
    v_cle     text;
    v_val     text;
begin
    if coalesce(btrim(p_code), '') = '' then
        raise exception 'Code client requis' using errcode = '22023';
    end if;
    select to_jsonb(s) into v_old from public.suivi s where s.code_client = p_code;
    v_new := coalesce(v_old, '{}'::jsonb);

    for v_cle in select jsonb_object_keys(coalesce(p_champs, '{}'::jsonb)) loop
        if not (v_cle = any (v_permis)) then
            raise exception 'Champ inconnu : %', v_cle using errcode = '22023';
        end if;
        v_val := coalesce(p_champs ->> v_cle, '');
        if btrim(v_val) = '' and v_cle = any (v_protege) and not (v_cle = any (v_efface))
           and coalesce(v_old ->> v_cle, '') <> '' then
            v_val := v_old ->> v_cle;                       -- on conserve ce qui était déjà saisi
        end if;
        v_new := v_new || jsonb_build_object(v_cle, left(v_val, 4000));
    end loop;

    v_new := v_new || jsonb_build_object('code_client', p_code, 'maj_le', v_now);
    if coalesce(p_utilisateur, '') <> '' or 'traite_par' = any (v_efface) then
        v_new := v_new || jsonb_build_object('traite_par', coalesce(p_utilisateur, ''));
    end if;

    insert into public.suivi as s
        select * from jsonb_populate_record(null::public.suivi, v_new)
    on conflict (code_client) do update set
        statut = excluded.statut, existe = excluded.existe, produits = excluded.produits,
        email_maj = excluded.email_maj, tel_maj = excluded.tel_maj, note = excluded.note,
        doublon_de = excluded.doublon_de, rappel_date = excluded.rappel_date, motif_sortie = excluded.motif_sortie,
        traite_par = excluded.traite_par, maj_le = excluded.maj_le;

    insert into public.historique (horodatage, auteur, type_fiche, code, donnees)
        values (v_now, coalesce(p_utilisateur, ''), 'client', p_code, v_new::text);
    if p_journaliser then
        insert into public.appels (horodatage, jour, utilisateur, type_fiche, code, statut, origine)
            values (v_now, left(v_now, 10), coalesce(p_utilisateur, ''), 'client', p_code, v_new ->> 'statut', 'appel');
    end if;
    return v_new;
end;
$$;

create or replace function public.fificli_enregistrer_adresse(
    p_code text, p_utilisateur text, p_champs jsonb, p_effacements text[] default '{}', p_journaliser boolean default true)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    v_protege text[] := array['referent','tel_site','note_adr'];
    v_permis  text[] := array['referent','tel_site','statut_adr','note_adr'];
    v_efface  text[] := coalesce(p_effacements, '{}');
    v_now     text := public.fificli_maintenant();
    v_old     jsonb;
    v_new     jsonb;
    v_cle     text;
    v_val     text;
begin
    if coalesce(btrim(p_code), '') = '' then
        raise exception 'Code adresse requis' using errcode = '22023';
    end if;
    select to_jsonb(s) into v_old from public.suivi_adresses s where s.code_adresse = p_code;
    v_new := coalesce(v_old, '{}'::jsonb);

    for v_cle in select jsonb_object_keys(coalesce(p_champs, '{}'::jsonb)) loop
        if not (v_cle = any (v_permis)) then
            raise exception 'Champ inconnu : %', v_cle using errcode = '22023';
        end if;
        v_val := coalesce(p_champs ->> v_cle, '');
        if btrim(v_val) = '' and v_cle = any (v_protege) and not (v_cle = any (v_efface))
           and coalesce(v_old ->> v_cle, '') <> '' then
            v_val := v_old ->> v_cle;
        end if;
        v_new := v_new || jsonb_build_object(v_cle, left(v_val, 4000));
    end loop;

    v_new := v_new || jsonb_build_object('code_adresse', p_code, 'maj_le', v_now);
    if coalesce(p_utilisateur, '') <> '' or 'traite_par' = any (v_efface) then
        v_new := v_new || jsonb_build_object('traite_par', coalesce(p_utilisateur, ''));
    end if;

    insert into public.suivi_adresses as s
        select * from jsonb_populate_record(null::public.suivi_adresses, v_new)
    on conflict (code_adresse) do update set
        referent = excluded.referent, tel_site = excluded.tel_site, statut_adr = excluded.statut_adr,
        note_adr = excluded.note_adr, traite_par = excluded.traite_par, maj_le = excluded.maj_le;

    insert into public.historique (horodatage, auteur, type_fiche, code, donnees)
        values (v_now, coalesce(p_utilisateur, ''), 'adresse', p_code, v_new::text);
    if p_journaliser then
        insert into public.appels (horodatage, jour, utilisateur, type_fiche, code, statut, origine)
            values (v_now, left(v_now, 10), coalesce(p_utilisateur, ''), 'adresse', p_code, v_new ->> 'statut_adr', 'appel');
    end if;
    return v_new;
end;
$$;

-- Réattribution manuelle (administrateur) : change qui a traité la fiche et son statut ; tracée au journal.
create or replace function public.fificli_reattribuer(p_code text, p_traitant text, p_statut text, p_auteur text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    v_now text := public.fificli_maintenant();
    v_old jsonb;
    v_new jsonb;
begin
    if coalesce(btrim(p_code), '') = '' then
        raise exception 'Code client requis' using errcode = '22023';
    end if;
    select to_jsonb(s) into v_old from public.suivi s where s.code_client = p_code;
    insert into public.suivi (code_client, statut, traite_par, maj_le)
        values (p_code, p_statut, coalesce(p_traitant, ''), v_now)
    on conflict (code_client) do update set
        statut = excluded.statut, traite_par = excluded.traite_par, maj_le = excluded.maj_le;
    select to_jsonb(s) into v_new from public.suivi s where s.code_client = p_code;

    insert into public.historique (horodatage, auteur, type_fiche, code, donnees)
        values (v_now, p_auteur, 'client', p_code, v_new::text);
    insert into public.appels (horodatage, jour, utilisateur, type_fiche, code, statut, origine)
        values (v_now, left(v_now, 10), p_auteur, 'client', p_code, p_statut, 'reattribution');
    insert into public.journal (horodatage, auteur, action, cible, detail)
        values (v_now, p_auteur, 'Réattribution de fiche', p_code,
                format('traité par « %s » → « %s » ; statut « %s » → « %s »',
                       coalesce(nullif(v_old ->> 'traite_par', ''), 'personne'), coalesce(nullif(p_traitant, ''), 'personne'),
                       coalesce(nullif(v_old ->> 'statut', ''), '—'), p_statut));
    return v_new;
end;
$$;

-- Présence : « telle personne regarde telle fiche ». Purge au passage les verrous périmés (> 36 min).
create or replace function public.fificli_poser_verrou(p_type text, p_code text, p_utilisateur text)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
    v_now text := public.fificli_maintenant();
begin
    insert into public.verrous (cle, type_fiche, code, utilisateur, depuis)
        values (p_type || ':' || p_code || ':' || p_utilisateur, p_type, p_code, p_utilisateur, v_now)
    on conflict (cle) do update set utilisateur = excluded.utilisateur, depuis = excluded.depuis;
    delete from public.verrous
     where depuis < to_char((now() - interval '36 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS');
    if p_type = 'client' then
        insert into public.meta (cle, valeur) values ('derniere_fiche_' || p_utilisateur, p_code)
        on conflict (cle) do update set valeur = excluded.valeur;
    end if;
end;
$$;

-- Réinitialisation complète du suivi (profil manager). L'historique des versions et le classeur sont conservés.
create or replace function public.fificli_reinitialiser(p_auteur text)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
    delete from public.suivi;
    delete from public.suivi_adresses;
    delete from public.meta;
    delete from public.verrous;
    delete from public.journal;
    delete from public.appels;
    insert into public.journal (horodatage, auteur, action, cible, detail)
        values (public.fificli_maintenant(), p_auteur, 'Réinitialisation complète', '—',
                'Suivi, référents et journal antérieur effacés.');
end;
$$;

-- Import du classeur par morceaux : on remplit la zone de transit (*_import), puis on la publie d'un seul coup.
create or replace function public.fificli_classeur_ajouter(
    p_cle text, p_colonnes jsonb, p_lignes jsonb, p_nom text, p_auteur text, p_debut boolean)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
    v_total bigint;
begin
    if p_cle not in ('clients_import', 'adresses_import') then
        raise exception 'Clé de transit invalide' using errcode = '22023';
    end if;
    if jsonb_typeof(p_lignes) <> 'array' then
        raise exception 'Les lignes doivent former un tableau' using errcode = '22023';
    end if;
    if p_debut then
        delete from public.fificli_classeur where cle = p_cle;
    end if;
    insert into public.fificli_classeur (cle, version, nom_fichier, importe_le, importe_par, colonnes, lignes)
        values (p_cle, 0, coalesce(p_nom, ''), now(), coalesce(p_auteur, ''), p_colonnes, p_lignes)
    on conflict (cle) do update set lignes = public.fificli_classeur.lignes || excluded.lignes;
    select jsonb_array_length(lignes) into v_total from public.fificli_classeur where cle = p_cle;
    return v_total;
end;
$$;

create or replace function public.fificli_classeur_publier(p_cle text, p_attendu bigint)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
    v_cible text := replace(p_cle, '_import', '');
    v_total bigint;
    v_version bigint;
begin
    if p_cle not in ('clients_import', 'adresses_import') then
        raise exception 'Clé de transit invalide' using errcode = '22023';
    end if;
    select jsonb_array_length(lignes) into v_total from public.fificli_classeur where cle = p_cle;
    if v_total is null or v_total <> p_attendu then
        raise exception 'Import incomplet : % ligne(s) reçue(s), % attendue(s)', coalesce(v_total, 0), p_attendu using errcode = '22023';
    end if;
    select coalesce(max(version), 0) + 1 into v_version from public.fificli_classeur where cle = v_cible;
    delete from public.fificli_classeur where cle = v_cible;
    update public.fificli_classeur set cle = v_cible, version = v_version, importe_le = now() where cle = p_cle;
    return v_version;
end;
$$;

-- Droits : uniquement le rôle serveur (la fonction Edge).
do $$
declare f text;
begin
    foreach f in array array[
        'public.fificli_maintenant()',
        'public.fificli_enregistrer_fiche(text,text,jsonb,text[],boolean)',
        'public.fificli_enregistrer_adresse(text,text,jsonb,text[],boolean)',
        'public.fificli_reattribuer(text,text,text,text)',
        'public.fificli_poser_verrou(text,text,text)',
        'public.fificli_reinitialiser(text)',
        'public.fificli_classeur_ajouter(text,jsonb,jsonb,text,text,boolean)',
        'public.fificli_classeur_publier(text,bigint)'
    ] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
        execute format('grant execute on function %s to service_role', f);
    end loop;
end;
$$;
