# -*- coding: utf-8 -*-
"""Produit tests/local/reference.json : résultats de l'ancien code Python (app.py, script.py) sur des données de test,
que tests/parite.test.js compare à la logique JavaScript.

Usage (depuis webapp/) :  python3 tests/generer_reference.py [classeur.json]
Sans classeur réel (tests/local/clients.json, non versionné), un jeu synthétique est utilisé.
Dépendances : pandas.
"""
import ast, datetime as dt, io, json, os, random, re, sys, types

import pandas as pd

D = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(D)
DEPOT = os.path.dirname(RACINE)
AUJOURDHUI = dt.date(2026, 11, 17)

# --- 1. modules Streamlit factices pour importer script.py et extraire les fonctions pures de app.py ---------------------------------
class _Factice(types.ModuleType):
    def __getattr__(self, nom):
        if nom.startswith('__'):
            raise AttributeError(nom)
        return lambda *a, **k: None
st = _Factice('streamlit'); st.components = _Factice('streamlit.components'); st.components.v1 = _Factice('streamlit.components.v1')
sys.modules.update({'streamlit': st, 'streamlit.components': st.components, 'streamlit.components.v1': st.components.v1})
sys.path.insert(0, DEPOT)
import script as sa  # noqa: E402

class _Date(dt.date):
    @classmethod
    def today(cls):
        return cls(AUJOURDHUI.year, AUJOURDHUI.month, AUJOURDHUI.day)
class _DT(types.SimpleNamespace):
    pass
dtfige = _DT(date=_Date, timedelta=dt.timedelta, datetime=dt.datetime)

source = open(os.path.join(DEPOT, 'app.py'), encoding='utf-8').read()
arbre = ast.parse(source)
VOULUES = ['jours_ouvres', 'date_apres_jours_ouvres', 'vers_iso', 'priorite', 'produit_principal', 'calculer_rythme', 'rappels_dus', 'rappels_planifies',
           '_classe_charge', 'stats_utilisateur', 'preparer_export', 'preparer_export_adresses', 'trouver_colonne', 'lire_csv_robuste',
           'importer_suivi_clients_csv', 'importer_suivi_adresses_csv', 'rapport_journalier', 'jolie_date', 'normaliser_clients', 'normaliser_adresses']
ns = {'pd': pd, 'dt': dtfige, 're': re, 'io': io, 'Iterable': object, 'ORIGINE_APPEL': 'appel',
      'STATUTS_TERMINES': {'Fait ✅', 'Doublon', 'Ancien client (à sortir)'}, 'LIBELLES_VIDES': {'Non traité', 'Non traitée', 'Non vérifié', 'Non vérifiée', '—', '-'},
      'CHAMPS_PROTEGES': ('existe', 'produits', 'email_maj', 'tel_maj', 'note', 'doublon_de', 'rappel_date', 'motif_sortie'), 'CHAMPS_PROTEGES_ADR': ('referent', 'tel_site', 'note_adr')}
for noeud in arbre.body:
    if isinstance(noeud, ast.FunctionDef) and noeud.name in VOULUES:
        exec(compile(ast.Module([noeud], []), 'app.py', 'exec'), ns)
manquantes = [n for n in VOULUES if n not in ns]
assert not manquantes, manquantes

# --- 2. données de test ------------------------------------------------------------------------------------------------------------
def charger(nom):
    chemin = os.path.join(D, 'local', nom)
    if os.path.exists(chemin):
        return json.load(open(chemin, encoding='utf-8'))
    return None
reel_c, reel_a = charger('clients.json'), charger('adresses.json')
rnd = random.Random(20261117)
if reel_c:
    colonnes = [c for c in reel_c['colonnes'] if c != "— données d'origine —"]
    idx = [reel_c['colonnes'].index(c) for c in colonnes]
    clients = pd.DataFrame([[l[i] for i in idx] for l in reel_c['lignes']], columns=colonnes).fillna('')
    adresses = pd.DataFrame(reel_a['lignes'], columns=reel_a['colonnes']).fillna('')
    adresses = adresses[[c for c in adresses.columns if c != "— données d'origine —"]]
    source_donnees = 'classeur réel'
else:
    source_donnees = 'jeu synthétique'
    types = ['Particulier', 'Particulier (déduit)', 'Pro', 'À déterminer', 'Pro (déduit)', 'Public/Asso']
    noms = ['EARL DU MOULIN', 'MAIRIE DE PRADES', 'DUPONT JEAN', 'TRANSPORTS MARTIN', 'SARL TP SUD', 'GAEC LES PINS', 'MME DURAND', 'SYNDICAT DES EAUX', 'ETS LAMBERT', 'LEROY PAUL']
    lignes = []
    for i in range(400):
        t = rnd.choice(types)
        lignes.append([str(1000 + i), t, rnd.choice(['', 'Pro', 'Particulier']), rnd.choice(noms) + ' ' + str(i), '', rnd.choice(['', '123456789', '412345678', '552100554']), '', '', '0561' + str(100000 + i), '', '', str(i) + ' rue', '81000', rnd.choice(['Albi', 'Gaillac', 'Carmaux']), rnd.choice(['', 'email']), '', '', '', '', '', '', '', ''])
    clients = pd.DataFrame(lignes, columns=['Code Client', 'Type client', 'Catégorie', 'Raison sociale / Nom', 'Indicatif', 'SIREN', 'Email principal', 'Email secondaire', 'Téléphone 1', 'Téléphone 2', 'Téléphone 3', 'Adresse 1', 'Code postal', 'Ville', 'À compléter', 'Adresse 2', 'Adresse 3', 'Commune', 'Mail', 'Catégorie Client', 'Siren / SIRET', 'Code Adresse Facturation', 'Indicatif2'])
    adresses = pd.DataFrame([[f'{1000 + i}L{j}', str(1000 + i), 'Site ' + str(j), 'rue', '', '', '81000', 'Albi', '', '0561'] for i in range(0, 300, 3) for j in (1, 2)],
                            columns=['Code adresse', 'Code client mère', 'Nom site', 'Adresse 1', 'Adresse 2', 'Adresse 3', 'Code postal', 'Ville', 'Commune', 'Téléphone'])
COL_CODE = 'Code Client'

STATUTS = ['À appeler', 'À rappeler', 'Injoignable', 'Boudret', 'Fait ✅', 'Doublon', 'Ancien client (à sortir)']
PERSONNES = ['Chloé', 'Patricia', 'Quentin', '']
codes = clients[COL_CODE].tolist()
echant = rnd.sample(codes, min(len(codes), 2000 if reel_c else 150))
suivi_lignes = []
for code in echant:
    s = rnd.choice(STATUTS)
    jour = AUJOURDHUI + dt.timedelta(days=rnd.randint(-20, 30))
    suivi_lignes.append({
        'code_client': code, 'statut': s, 'existe': rnd.choice(['', 'Oui', 'Non', 'Incertain']), 'produits': '|'.join(rnd.sample(['GNR', 'HVO', 'AdBlue', 'Fioul domestique'], rnd.randint(0, 3))),
        'email_maj': '', 'tel_maj': '', 'note': rnd.choice(['', 'rappel client', 'KBIS demandé\n13/10 relance']), 'doublon_de': '', 'rappel_date': jour.isoformat() if s == 'À rappeler' and rnd.random() < .9 else '',
        'motif_sortie': '', 'traite_par': rnd.choice(PERSONNES[:3]) if rnd.random() < .85 else '',
        'maj_le': (dt.datetime(2026, 11, 1) + dt.timedelta(days=rnd.randint(0, 16), hours=rnd.randint(7, 17), minutes=rnd.randint(0, 59))).isoformat(timespec='seconds'),
    })
suivi = pd.DataFrame(suivi_lignes)
a_codes = adresses['Code adresse'].tolist()
suivi_adr = pd.DataFrame([{'code_adresse': c, 'referent': rnd.choice(['', 'Paul', 'Mme Roux']), 'tel_site': '', 'statut_adr': rnd.choice(['À vérifier', 'Vérifié ✅', 'Adresse obsolète']), 'note_adr': '',
                           'traite_par': rnd.choice(PERSONNES[:3]), 'maj_le': '2026-11-10T09:00:00'} for c in rnd.sample(a_codes, min(len(a_codes), 200))])

# --- 3. base de travail, comme app.py (lignes 2109-2114) -------------------------------------------------------------------------
base = clients.merge(suivi, left_on=COL_CODE, right_on='code_client', how='left')
for c in ['statut', 'existe', 'produits', 'email_maj', 'tel_maj', 'note', 'doublon_de', 'rappel_date', 'motif_sortie', 'traite_par']:
    base[c] = base[c].fillna('') if c in base.columns else ''
base['statut'] = base['statut'].replace('', 'À appeler')
base['priorite'] = base['Type client'].map(ns['priorite'])

ref = {'source': source_donnees, 'aujourdhui': AUJOURDHUI.isoformat()}

# priorités
types_vus = sorted(set(clients['Type client']) | {'', 'Pro', 'pro', 'À déterminer', 'Public/Asso', 'Association', 'Particulier (déduit)'})
ref['priorite'] = {t: ns['priorite'](t) for t in types_vus}

# typologie : toutes les fiches
def propre(valeur):
    return valeur
typologies = {}
for _, ligne in base.iterrows():
    d = sa.deviner_typologie(ligne.to_dict())
    typologies[str(ligne[COL_CODE])] = [d.typologie, d.sous_type, d.motif, d.confiance]
ref['typologies'] = typologies
ref['typologie_vide'] = list(map(lambda d: [d.typologie, d.sous_type, d.motif, d.confiance], [sa.deviner_typologie(None), sa.deviner_typologie({})]))

# file d'appel (app.py lignes 2368-2399)
TRAITANTS = ['Chloé', 'Patricia', 'Quentin']
def file_appel(f_traitement, f_type, f_statut, f_acompl, recherche, tri_priorite, occupees):
    fa = base.copy()
    if f_traitement:
        masques = []
        if 'Non traité' in f_traitement:
            masques.append(fa['traite_par'].astype(str).str.strip() == '')
        for nom in TRAITANTS:
            if f'Traité par {nom}' in f_traitement:
                masques.append(fa['traite_par'] == nom)
        if masques:
            garde = masques[0]
            for m in masques[1:]:
                garde = garde | m
            fa = fa[garde]
    if occupees:
        fa = fa[~fa[COL_CODE].astype(str).isin(occupees)]
    if f_type:
        fa = fa[fa['Type client'].isin(f_type)]
    if f_statut:
        fa = fa[fa['statut'].isin(f_statut)]
    if f_acompl and 'À compléter' in fa.columns:
        fa = fa[fa['À compléter'].astype(str).str.strip() != '']
    if recherche:
        r = recherche.lower()
        fa = fa[fa[COL_CODE].astype(str).str.lower().str.contains(r, na=False) | fa['Raison sociale / Nom'].str.lower().str.contains(r, na=False) | fa['Ville'].str.lower().str.contains(r, na=False)]
    tri = ['priorite', 'Raison sociale / Nom'] if tri_priorite else ['Raison sociale / Nom']
    return fa.sort_values(tri).reset_index(drop=True)[COL_CODE].astype(str).tolist()

occ = set(rnd.sample([str(c) for c in codes], 25))
scenarios = [
    dict(f_traitement=['Non traité'], f_type=[], f_statut=['À appeler', 'À rappeler'], f_acompl=False, recherche='', tri_priorite=True, occupees=occ),
    dict(f_traitement=['Non traité', 'Traité par Chloé'], f_type=['Pro', 'Pro (déduit)'], f_statut=[], f_acompl=False, recherche='', tri_priorite=True, occupees=set()),
    dict(f_traitement=[], f_type=[], f_statut=['À rappeler'], f_acompl=False, recherche='', tri_priorite=False, occupees=set()),
    dict(f_traitement=['Traité par Patricia'], f_type=[], f_statut=[], f_acompl=False, recherche='a', tri_priorite=True, occupees=set()),
    dict(f_traitement=[], f_type=[], f_statut=['À appeler'], f_acompl=True, recherche='', tri_priorite=True, occupees=set()),
    dict(f_traitement=['Non traité'], f_type=[], f_statut=['À appeler', 'À rappeler'], f_acompl=False, recherche='mairie', tri_priorite=True, occupees=set()),
]
ref['files'] = []
for sc in scenarios:
    ref['files'].append({'filtres': {**sc, 'occupees': sorted(sc['occupees'])}, 'codes': file_appel(**sc)})

# rappels
def liste_rappels(fonction, utilisateur):
    df = fonction(base, utilisateur) if utilisateur else fonction(base)
    return [[str(r[COL_CODE]), r['date_rappel'].isoformat()] for _, r in df.iterrows()] if not df.empty else []
ref['rappels_dus'] = {u or 'tous': liste_rappels(ns['rappels_dus'], u) for u in ('Chloé', 'Patricia', 'Quentin', None)}
ref['rappels_planifies'] = {u or 'tous': liste_rappels(ns['rappels_planifies'], u) for u in ('Chloé', 'Patricia', None)}
ref['classe_charge'] = [[n, (AUJOURDHUI + dt.timedelta(days=dj)).isoformat(), ns['_classe_charge'](n, AUJOURDHUI + dt.timedelta(days=dj))] for n in (0, 1, 3, 4, 7, 8, 12) for dj in (-3, 0, 5)]

# indicateurs
suivi_f = suivi.fillna('')
compteurs = {('Chloé', 'client'): 12, ('Patricia', 'client'): 7, ('Chloé', 'adresse'): 2}
ref['rythme'] = {(u or 'tous'): ns['calculer_rythme'](suivi_f, u) for u in ('Chloé', 'Patricia', 'Quentin', 'Inconnu', None)}
ref['stats'] = {u: ns['stats_utilisateur'](suivi_f, suivi_adr, u, compteurs) for u in ('Chloé', 'Patricia', 'Quentin')}
ref['compteurs'] = {f'{u}|{t}': n for (u, t), n in compteurs.items()}

# jours ouvrés
paires = []
for _ in range(120):
    a = AUJOURDHUI + dt.timedelta(days=rnd.randint(-40, 40)); b = AUJOURDHUI + dt.timedelta(days=rnd.randint(-40, 700))
    paires.append([a.isoformat(), b.isoformat(), ns['jours_ouvres'](a, b)])
paires.append([AUJOURDHUI.isoformat(), '2027-09-01', ns['jours_ouvres'](AUJOURDHUI, dt.date(2027, 9, 1))])
ref['jours_ouvres'] = paires
ref['apres_jours_ouvres'] = [[a, n, ns['date_apres_jours_ouvres'](dt.date.fromisoformat(a), n).isoformat()] for a in ('2026-11-17', '2026-11-20', '2026-11-21', '2026-12-31') for n in (0, 1, 4, 5, 9, 37, 120)]

# dates lues
ref['vers_iso'] = {t: ns['vers_iso'](t) for t in ['2026-09-03', '2026-09-03T10:00:00', '03/09/2026', '3/9/2026', '31/12/26', '2026-13-45', '', '  ', 'abc', '15/12/2026', '2027-01-11']}

# restauration CSV
csv_clients = "Code client;Statut de l'appel;Client actif ?;Produits achetés;E-mail confirmé;Téléphone confirmé;Doublon du n°;Motif de sortie;À rappeler le;Notes;Traité par\n" \
              "A1;Fait ✅;Oui;GNR, HVO;a@b.fr;0102;;;;ok;Chloé\nA2;À rappeler;Non traité;;;;;—;15/12/2026;\"note; avec point-virgule\";Non traité\n;Doublon;;;;;;;;;\nA3;Doublon;Oui;AdBlue;;;A1;Doublon;2026-12-01;x;Patricia\n"
captures = []
ns['enregistrer'] = lambda code, utilisateur='', **kw: captures.append({'code': code, 'traite_par': utilisateur, **{k: v for k, v in kw.items() if k not in ('effacements', 'invalider_cache')}})
f = io.BytesIO(csv_clients.encode('utf-8-sig')); ns['importer_suivi_clients_csv'](f)
ref['csv_clients'] = {'texte': csv_clients, 'lignes': [{'code': c['code'], 'traite_par': c['traite_par'], 'champs': {k: c[k] for k in ('statut', 'existe', 'produits', 'email_maj', 'tel_maj', 'doublon_de', 'motif_sortie', 'note', 'rappel_date')}} for c in captures]}
csv_adr = "Code adresse;Référent sur place;Tél. référent / site;Statut vérification;Note;Vérifié par\n12L1;Paul;0102;Vérifié ✅;ok;Chloé\n12L2;;;À vérifier;;Non traité\n12L3;;;Adresse obsolète;;\n"
captures.clear()
ns['enregistrer_adresse'] = lambda code, utilisateur='', **kw: captures.append({'code': code, 'traite_par': utilisateur, **{k: v for k, v in kw.items() if k not in ('effacements', 'invalider_cache')}})
f = io.BytesIO(csv_adr.encode('utf-8-sig')); ns['importer_suivi_adresses_csv'](f)
ref['csv_adresses'] = {'texte': csv_adr, 'lignes': [{'code': c['code'], 'traite_par': c['traite_par'], 'champs': {k: c[k] for k in ('referent', 'tel_site', 'statut_adr', 'note_adr')}} for c in captures]}

# exports (sans la colonne « Dernière mise à jour », convertie en heure de Paris côté JavaScript)
exp = ns['preparer_export'](suivi_f, base, COL_CODE)
ref['export_clients'] = {'colonnes': list(exp.columns), 'lignes': exp.drop(columns=['Dernière mise à jour']).astype(str).values.tolist(), 'ordre': suivi_f['code_client'].astype(str).tolist()}
adr_norm = adresses[['Code adresse', 'Code client mère', 'Nom site', 'Code postal', 'Ville']].copy()
exp_a = ns['preparer_export_adresses'](suivi_adr, adresses)
ref['export_adresses'] = {'colonnes': list(exp_a.columns), 'lignes': exp_a.drop(columns=['Dernière mise à jour']).astype(str).values.tolist()}

# reporting journalier
appels = []
for _ in range(900):
    j = AUJOURDHUI - dt.timedelta(days=rnd.randint(0, 45))
    appels.append({'jour': j.isoformat(), 'utilisateur': rnd.choice(['Chloé', 'Patricia', 'Quentin']), 'type_fiche': rnd.choice(['client'] * 4 + ['adresse']), 'code': str(rnd.randint(1000, 1100)),
                   'statut': rnd.choice(STATUTS), 'origine': rnd.choice(['appel'] * 5 + ['reattribution', 'import']), 'horodatage': j.isoformat() + 'T10:00:00'})
ns['charger_appels'] = lambda depuis=None: pd.DataFrame([a for a in appels if depuis is None or a['jour'] >= depuis.isoformat()])
ref['appels'] = appels
ref['rapports'] = {}
for jours in (7, 30, 90):
    r = ns['rapport_journalier'](jours)
    if r['vide']:
        ref['rapports'][str(jours)] = {'vide': True}
        continue
    pj = r['par_jour']
    ref['rapports'][str(jours)] = {'vide': False, 'total': r['total'], 'points': r['points'], 'jours_actifs': r['jours_actifs'], 'hors_appels': r['hors_appels'], 'personnes': list(pj.columns),
                                   'tableau': [[idx] + [int(v) for v in ligne] for idx, ligne in zip(pj.index, pj.values.tolist())],
                                   'par_statut': {u: {s: int(n) for s, n in ligne.items() if n} for u, ligne in r['par_statut'].iterrows()}}

# échantillon de données pour le test JavaScript
ref['entree'] = {
    'colonnes': list(clients.columns), 'colCode': COL_CODE, 'clients': clients.astype(str).values.tolist(),
    'adr_colonnes': list(adresses.columns), 'adresses': adresses.astype(str).values.tolist(),
    'suivi': suivi_f.astype(str).to_dict(orient='records'), 'suivi_adr': suivi_adr.to_dict(orient='records'),
}
# normalisation d'un classeur brut (import par l'administrateur), si le classeur réel est disponible
xlsx = os.path.join(D, 'local', 'classeur.xlsx')
if os.path.exists(xlsx):
    xl = pd.ExcelFile(xlsx, engine='openpyxl')
    brut_c = pd.read_excel(xl, 'Clients', dtype=str).fillna('')
    brut_a = pd.read_excel(xl, 'Adresses livraison', dtype=str).fillna('')
    nc, colc = ns['normaliser_clients'](brut_c.copy())
    na = ns['normaliser_adresses'](brut_a.copy())
    nc = nc[[c for c in nc.columns if not re.match(r'^—.*—$', str(c).strip())]]
    na = na[[c for c in na.columns if not re.match(r'^—.*—$', str(c).strip())]]
    ref['classeur'] = {'brut_c': {'colonnes': list(brut_c.columns), 'lignes': brut_c.astype(str).values.tolist()}, 'brut_a': {'colonnes': list(brut_a.columns), 'lignes': brut_a.astype(str).values.tolist()},
                       'norm_c': {'colonnes': list(nc.columns), 'lignes': nc.astype(str).values.tolist()}, 'norm_a': {'colonnes': list(na.columns), 'lignes': na.astype(str).values.tolist()}, 'col_code': colc}

os.makedirs(os.path.join(D, 'local'), exist_ok=True)
chemin = os.path.join(D, 'local', 'reference.json')
json.dump(ref, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False, default=lambda o: None if o != o else float(o) if hasattr(o, '__float__') else str(o))
print('référence écrite :', chemin, '|', source_donnees, '|', len(codes), 'clients,', len(echant), 'fiches de suivi,', len(ref['files']), 'files d\'appel')
