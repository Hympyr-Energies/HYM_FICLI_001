# Supabase · cockpit appels

Projet : `cmvkijtlkzfwnzipgstc`. Adresse de la fonction : `https://cmvkijtlkzfwnzipgstc.supabase.co/functions/v1/fificli-api`.

## Mise en place (déjà faite)

1. Migration `migrations/20261117_fificli_webapp.sql` : tables `fificli_membres`, `fificli_tickets`, `fificli_classeur` et fonctions d'écriture. Elle est **additive** : aucune table existante n'est modifiée.
2. Fonction Edge `functions/fificli-api` (sans vérification JWT intégrée : elle valide elle-même le jeton du membre).
3. Reprise du classeur clients existant dans `fificli_classeur`.

Variables facultatives de la fonction (valeurs par défaut déjà correctes) : `FIFICLI_ALLOWED_ORIGIN` (origine autorisée, défaut `https://hympyr-energies.github.io`) et `FIFICLI_SITE_URL` (page des e-mails « mot de passe oublié », défaut : le portail).
La page n'utilise plus les actions `login`, `refresh` et `recover` : la connexion se fait au portail. Elles restent dans la fonction, sans effet sur la sécurité, en attendant leur retrait.

## Ajouter un membre avec son e-mail et un mot de passe

Un membre = **une ligne dans `fificli_membres`** + **un compte dans Authentication**, avec le même e-mail.

1. *Table Editor* → `fificli_membres` → *Insert row* :
   - `email` : l'adresse du membre ;
   - `nom` : le prénom **exactement comme dans les fiches** (`Chloé`, `Patricia`, `Mika`, `Quentin`) : c'est la valeur de « Traité par » ;
   - `role` : `commercial`, `manager` ou `admin` ;
   - `actif` : `true`.
2. *Authentication* → *Users* → *Add user* → *Create new user* : même e-mail, mot de passe choisi, case **Auto Confirm User** cochée.

Équivalent en SQL (éditeur SQL) pour la première étape :

```sql
insert into public.fificli_membres (email, nom, role) values
  ('chloe@exemple.fr',    'Chloé',    'commercial'),
  ('patricia@exemple.fr', 'Patricia', 'commercial'),
  ('mika@exemple.fr',     'Mika',     'manager'),
  ('quentin@exemple.fr',  'Quentin',  'admin');
```

- **Changer un mot de passe** : *Authentication → Users →* le membre → *Send password recovery*, ou le membre utilise « Mot de passe oublié ? » sur la page de connexion, ou *Mon compte → Changer mon mot de passe* (10 caractères minimum).
- **Suspendre un accès** : passer `actif` à `false` dans `fificli_membres` (le compte Authentication reste).
- **Supprimer un membre** : supprimer la ligne de `fificli_membres` et l'utilisateur dans Authentication. Ses saisies restent dans l'historique.
- Un compte Authentication qui n'est pas dans `fificli_membres` est refusé.

## Réglages Authentication à vérifier (tableau de bord)

- *Sign In / Providers* : désactiver les inscriptions libres.
- *URL Configuration* : « Site URL » = adresse de la page (`https://quentindebrie-code.github.io/HYM_FICLI_001/webapp/`) pour que le lien de réinitialisation ramène à l'outil.

## Sécurité

- Les nouvelles tables ont la protection par ligne (RLS) activée sans politique et aucun droit pour `anon` / `authenticated` : seule la fonction Edge (rôle serveur) y accède.
- Les tables de l'ancien outil (`suivi`, `suivi_adresses`, `appels`, `journal`, `historique`, `verrous`, `meta`, `fichiers`) ont **la protection par ligne désactivée** et sont lisibles et modifiables avec la clé publique du projet. À fermer une fois l'ancien outil Streamlit arrêté (ou après avoir vérifié qu'il se connecte avec le rôle `postgres`) :

```sql
-- à n'exécuter qu'après vérification (sinon l'ancien outil Streamlit peut perdre l'accès)
alter table public.suivi enable row level security;
alter table public.suivi_adresses enable row level security;
alter table public.appels enable row level security;
alter table public.journal enable row level security;
alter table public.historique enable row level security;
alter table public.verrous enable row level security;
alter table public.meta enable row level security;
alter table public.fichiers enable row level security;
```
