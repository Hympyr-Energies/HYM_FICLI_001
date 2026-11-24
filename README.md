# Cockpit appels — Hympyr Énergies

Suivi des appels clients et des points de livraison. L'outil est une application web statique (`webapp/index.html`), publiée sur GitHub Pages et branchée sur Supabase par la fonction Edge `fificli-api`.

- Adresse : https://hympyr-energies.github.io/HYM_FICLI_001/webapp/
- Connexion : par le portail Hympyr (https://hympyr-energies.github.io/portail/), une seule connexion pour tous les outils.
- Documentation technique : [webapp/README.md](webapp/README.md) ; base et fonction Edge : [webapp/supabase/README.md](webapp/supabase/README.md).

L'ancienne version Streamlit (`app.py`) a été retirée le 24/11/2026. Elle reste consultable dans l'historique Git.
`script.py` est conservé : c'est la source du contenu des scripts d'appel (`webapp/outils/exporter_scripts.py` en régénère `webapp/src/scripts.json`).
