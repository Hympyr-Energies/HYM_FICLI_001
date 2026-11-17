# -*- coding: utf-8 -*-
"""Exporte les scripts d'appel de script.py (contenu métier) vers src/scripts.json, tels quels.
Usage (depuis webapp/) : python3 outils/exporter_scripts.py"""
import dataclasses, json, os, sys, types

D = os.path.dirname(os.path.abspath(__file__))
DEPOT = os.path.dirname(os.path.dirname(D))

class _Factice(types.ModuleType):
    def __getattr__(self, nom):
        if nom.startswith('__'):
            raise AttributeError(nom)
        return lambda *a, **k: None
st = _Factice('streamlit'); st.components = _Factice('streamlit.components'); st.components.v1 = _Factice('streamlit.components.v1')
sys.modules.update({'streamlit': st, 'streamlit.components': st.components, 'streamlit.components.v1': st.components.v1})
sys.path.insert(0, DEPOT)
import script as sa

def vers_dict(o):
    if dataclasses.is_dataclass(o):
        return {k: vers_dict(v) for k, v in dataclasses.asdict(o).items()}
    return o
sortie = {'ordre': list(sa.ORDRE_ONGLETS), 'scripts': {cle: vers_dict(s) for cle, s in sa.SCRIPTS.items()}}
chemin = os.path.join(os.path.dirname(D), 'src', 'scripts.json')
json.dump(sortie, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for cle, s in sortie['scripts'].items():
    print(cle, '|', len(s['etapes']), 'étapes |', len(s['objections']), 'objections |', len(s['regles_or']), 'règles d\'or |', len(s['a_consigner']), 'à consigner')
print('écrit :', chemin, os.path.getsize(chemin), 'octets')
