# Cockpit appels · Hympyr Énergies (webapp)

Refonte de l'ancien outil Streamlit (`app.py`, retiré le 24/11/2026) en application web statique : un seul fichier `index.html`, sans serveur applicatif, branchée sur Supabase.
Mêmes fonctionnalités et mêmes règles de calcul que l'ancien outil (vérifiées par des tests de parité sur les 9 638 clients réels), nouvelle interface.

## Ce que fait l'outil

| Écran | Contenu |
|---|---|
| **Synthèse** | Chiffres du jour, rappels à passer, 15 prochains jours, avancement de l'équipe, objectif du 1er septembre 2027 |
| **Appels** | File d'appel filtrable, fiche client, script d'appel et objections (type de client déduit), résultat de l'appel, administration de la fiche (admin) |
| **Livraisons** | Vérification des points de livraison : référent sur place, téléphone, statut |
| **Rappels** | Calendrier mensuel de la charge à venir, liste des clients à rappeler par jour |
| **Export** (commerciales) | CSV et Excel du suivi et des points de livraison, confirmation d'export |
| **Pilotage** (manager, admin) | Objectif, performance par commerciale, reporting journalier, journal, tickets, exports (admin), données : import du classeur, restauration CSV, réinitialisation (manager) |
| **Ticket** (bouton en bas à droite) | Envoi d'un problème, d'une suggestion ou d'une question, avec l'écran concerné ; suivi des réponses |

Rôles : `commercial` (Chloé, Patricia), `manager` (Mika), `admin` (Quentin). Ils viennent de la table `fificli_membres`, plus d'un mot de passe en dur dans le code.

## Données conservées

Rien n'est migré ni supprimé : la webapp lit et écrit **les mêmes tables que l'ancien outil** (`suivi`, `suivi_adresses`, `appels`, `journal`, `historique`, `verrous`, `meta`, `fichiers`), avec les mêmes valeurs. Les deux outils peuvent fonctionner en parallèle pendant la transition.
Les statuts gardent leur valeur d'origine en base (`Fait ✅`, `Vérifié ✅`) ; les écrans affichent « Fait » et « Vérifié ». Les exports conservent la valeur d'origine pour pouvoir être restaurés.
Le classeur clients (feuilles « Clients » et « Adresses livraison » du fichier `CLIENTS_HYMPYR`) a été repris dans la table `fificli_classeur` (9 638 clients, 3 324 points de livraison). Un administrateur peut en importer un nouveau depuis Pilotage > Données.

## Architecture

```
navigateur (index.html)  ──►  fonction Edge « fificli-api »  ──►  Supabase (Auth + Postgres)
   session du portail             détient les clés                    comptes, tables, fonctions SQL
```

- **Connexion unique** : la page n'a plus d'écran de connexion. Elle lit la session supabase-js ouverte au portail Hympyr (même origine `hympyr-energies.github.io`, même clé de stockage) ; sans session, elle renvoie au portail avec `?retour=` et y revient une fois connecté. « Se déconnecter » ferme la session de tous les outils. Si la session est fermée ailleurs en cours de travail, un panneau masque les données et la saisie en cours est reprise après reconnexion.
- La page contient seulement la clé **publishable** (publique par conception, la même que le portail). Les données passent toujours par la fonction `fificli-api`, qui valide le jeton, vérifie l'appartenance à `fificli_membres` et applique les droits du rôle ; les tables du cockpit n'ont aucun droit pour les rôles `anon` et `authenticated`.
- Chaque enregistrement est une fonction SQL (une transaction) : fiche + version dans `historique` + ligne dans `appels`. Un champ laissé vide ne remplace jamais une information déjà saisie, sauf effacement demandé explicitement.
- Les horodatages restent en UTC, comme l'existant ; l'affichage est en heure de Paris.
- Le classeur est mis en cache dans le navigateur (IndexedDB) tant que sa version ne change pas ; le cache est vidé à la déconnexion.

## Fichiers

```
webapp/
  index.html                          page construite (CSS, JS, logo, scripts d'appel intégrés)
  build.py                            assemble src/ en index.html
  src/                                sources : logique.js (règles métier), core.js, ui.js, donnees.js, vue-*.js, tickets.js, main.js, styles.css, template.html, scripts.json
  outils/exporter_scripts.py          régénère src/scripts.json depuis script.py (contenu métier des scripts d'appel)
  supabase/migrations/…               tables et fonctions SQL (migration additive)
  supabase/functions/fificli-api/     fonction Edge
  tests/                              parité Python/JavaScript, fonction Edge, serveur simulé
```

## Construire la page

```bash
python3 build.py --api-url https://cmvkijtlkzfwnzipgstc.supabase.co/functions/v1/fificli-api
```

## Tests

```bash
node tests/syntaxe.js                       # syntaxe des modules
node tests/fonction.test.js                 # fonction Edge réelle contre un faux Supabase (16 groupes)
node tests/parite.test.js                   # parité avec l'ancien Python, sur une référence figée (tests/reference.json, jeu synthétique)
node tests/serveur_simule.js 8781           # faux serveur pour essayer l'interface (python3 build.py --api-url http://127.0.0.1:8781 --out dist-test/index.html)
```

La parité s'exécute sur le classeur réel si `tests/local/` le contient (dossier ignoré par git : données clients) ; sinon sur un jeu synthétique.

## Ajouter un membre (e-mail et mot de passe)

Voir [supabase/README.md](supabase/README.md).
