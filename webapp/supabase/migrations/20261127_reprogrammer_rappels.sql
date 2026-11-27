-- =====================================================================
-- Cockpit appels (FE - MÀJ fichier clients) · Rappels > Reprogrammer en lot
-- Fichier 18_ficli_reprogrammer_rappels.sql. À exécuter une fois dans Supabase > SQL Editor. Tout ou rien.
--
-- Principe :
--   - Une seule fonction, fificli_reprogrammer_rappels(codes, jour_de, jour_vers), appelée avec le jeton de la
--     personne connectée (la fonction Edge fificli-api le transmet tel quel). L'identité vient du jeton
--     (auth.jwt()), jamais d'un paramètre : on ne peut pas se faire passer pour quelqu'un d'autre.
--   - Les droits sont appliqués ici, dans la base :
--       commercial : uniquement les rappels dont il ou elle est la personne qui traite la fiche (traite_par) ;
--       admin      : les rappels de n'importe quel compte ;
--       manager    : aucun (lecture seule, comme pour le reste du cockpit).
--   - Une fiche n'est déplacée que si elle est toujours « À rappeler » ET toujours datée du jour d'origine
--     (protection contre une modification faite entre-temps par quelqu'un d'autre). Les autres sont ignorées
--     et renvoyées dans la réponse.
--   - La personne qui traite la fiche ne change pas, ni le statut, ni les notes : seule rappel_date bouge.
--   - Traces : une version par fiche dans « historique », une ligne de synthèse dans « journal » (Pilotage),
--     et, quand un admin déplace les rappels d'un autre compte, une ligne dans l'historique des actions
--     du portail (portail_admin_journal, script 15), auteur et heure posés par la base.
-- =====================================================================
begin;

-- ---------- 1. lecture tolérante d'une date de rappel (même règle que H.versIso côté navigateur) ----------
create or replace function public.fificli_date_rappel(p text)
returns date language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  if p is null or btrim(p) = '' then return null; end if;
  m := regexp_match(btrim(p), '^(\d{4})-(\d{2})-(\d{2})');
  if m is not null then return make_date(m[1]::int, m[2]::int, m[3]::int); end if;
  m := regexp_match(btrim(p), '^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})');
  if m is not null then
    return make_date(case when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end, m[2]::int, m[1]::int);
  end if;
  return null;
exception when others then return null;   -- date impossible (31/02…) : ignorée, comme dans l'interface
end $$;
revoke all on function public.fificli_date_rappel(text) from public, anon, authenticated;

-- ---------- 2. reprogrammation en lot ----------
-- p_de : jour d'origine affiché à l'écran ; null = sélection « En retard » (toute date antérieure à aujourd'hui).
create or replace function public.fificli_reprogrammer_rappels(p_codes text[], p_de date, p_vers date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_moi     record;
  v_auj     date := (now() at time zone 'Europe/Paris')::date;
  v_now     text := public.fificli_maintenant();
  v_codes   text[];
  v_faits   jsonb := '[]'::jsonb;
  v_ignores text[];
  r         record;
  v_new     jsonb;
  v_par     jsonb := '{}'::jsonb;   -- { traite_par : nombre } pour les traces
  v_de_txt  text := case when p_de is null then 'en retard' else to_char(p_de, 'DD/MM/YYYY') end;
  k         text;
begin
  -- qui appelle ? (le jeton a déjà été validé par Supabase ; on vérifie l'appartenance au cockpit)
  select m.email, m.nom, m.role into v_moi
    from public.fificli_membres m where m.email = v_email and m.actif limit 1;
  if v_moi.email is null then
    raise exception 'Ce compte n''est pas autorisé à utiliser le cockpit.' using errcode = '42501';
  end if;
  if v_moi.role not in ('commercial', 'admin') then
    raise exception 'Votre profil ne permet pas de reprogrammer des rappels.' using errcode = '42501';
  end if;

  -- contrôles des paramètres
  v_codes := array(select distinct btrim(c) from unnest(coalesce(p_codes, '{}')) c where btrim(coalesce(c, '')) <> '');
  if cardinality(v_codes) = 0 then raise exception 'Aucun rappel sélectionné.' using errcode = '22023'; end if;
  if cardinality(v_codes) > 1000 then raise exception 'Sélection trop grande (1000 rappels au maximum).' using errcode = '22023'; end if;
  if p_vers is null then raise exception 'Nouvelle date manquante.' using errcode = '22023'; end if;
  if p_vers < v_auj then raise exception 'La nouvelle date ne peut pas être dans le passé.' using errcode = '22023'; end if;
  if p_vers > v_auj + 730 then raise exception 'La nouvelle date est trop lointaine (2 ans au maximum).' using errcode = '22023'; end if;
  if p_de is not null and p_de = p_vers then raise exception 'La nouvelle date est identique à la date actuelle.' using errcode = '22023'; end if;

  -- fiches éligibles, verrouillées le temps de la transaction (pas de double déplacement concurrent)
  for r in
    select s.* from public.suivi s
     where s.code_client = any (v_codes)
       and s.statut = 'À rappeler'
       and (v_moi.role = 'admin' or s.traite_par = v_moi.nom)
       and case when p_de is null then public.fificli_date_rappel(s.rappel_date) < v_auj
                else public.fificli_date_rappel(s.rappel_date) = p_de end
     order by s.code_client
     for update
  loop
    update public.suivi s set rappel_date = to_char(p_vers, 'YYYY-MM-DD'), maj_le = v_now
     where s.code_client = r.code_client
     returning to_jsonb(s) into v_new;
    insert into public.historique (horodatage, auteur, type_fiche, code, donnees)
      values (v_now, v_moi.nom, 'client', r.code_client, v_new::text);
    v_faits := v_faits || jsonb_build_array(v_new);
    k := coalesce(nullif(r.traite_par, ''), '');
    v_par := v_par || jsonb_build_object(k, coalesce((v_par ->> k)::int, 0) + 1);
  end loop;

  v_ignores := array(select c from unnest(v_codes) c
                      where not exists (select 1 from jsonb_array_elements(v_faits) f where f ->> 'code_client' = c));

  if jsonb_array_length(v_faits) > 0 then
    -- journal du cockpit (Pilotage > Journal)
    insert into public.journal (horodatage, auteur, action, cible, detail)
      values (v_now, v_moi.nom, 'Reprogrammation de rappels',
              jsonb_array_length(v_faits) || ' fiche' || case when jsonb_array_length(v_faits) > 1 then 's' else '' end,
              format('rappels %s → %s ; %s', case when p_de is null then 'en retard' else 'du ' || v_de_txt end, to_char(p_vers, 'DD/MM/YYYY'),
                     (select string_agg(coalesce(nullif(key, ''), 'non attribué') || ' : ' || value, ', ' order by key)
                        from jsonb_each_text(v_par))));

    -- historique des actions du portail : un admin qui déplace les rappels d'un autre compte
    if v_moi.role = 'admin' and to_regclass('public.portail_admin_journal') is not null then
      for k in select key from jsonb_each_text(v_par) where key is distinct from v_moi.nom loop
        insert into public.portail_admin_journal (action, cible_email, detail, avant, apres, origine)
        values ('rappels_reprogrammes',
                (select m.email from public.fificli_membres m where m.nom = k limit 1),
                jsonb_strip_nulls(jsonb_build_object('outil', 'cockpit_appels', 'nombre', (v_par ->> k)::int,
                                                     'compte', nullif(k, ''))),
                jsonb_build_object('rappel_date', v_de_txt),
                jsonb_build_object('rappel_date', to_char(p_vers, 'DD/MM/YYYY')),
                'outil');
      end loop;
    end if;
  end if;

  return jsonb_build_object('fiches', v_faits, 'ignores', to_jsonb(coalesce(v_ignores, '{}')), 'serveur_le', v_now);
end $$;

-- appelable avec le jeton de la personne connectée (la fonction vérifie elle-même l'appartenance et le rôle)
revoke all on function public.fificli_reprogrammer_rappels(text[], date, date) from public, anon;
grant execute on function public.fificli_reprogrammer_rappels(text[], date, date) to authenticated;

commit;

-- Vérification (lecture seule) : la fonction existe et n'est pas ouverte aux visiteurs anonymes.
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_peut,
       has_function_privilege('authenticated', p.oid, 'execute') as connecte_peut
  from pg_proc p where p.proname in ('fificli_reprogrammer_rappels', 'fificli_date_rappel');
