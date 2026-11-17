/* Parité Python ↔ JavaScript : compare src/logique.js aux résultats de l'ancien code (tests/generer_reference.py).
   Usage : python3 tests/generer_reference.py && node tests/parite.test.js */
const fs = require('fs'), path = require('path'), assert = require('assert');
const H = require('../src/logique.js');
const chemin = path.join(__dirname, 'local', 'reference.json');
if (!fs.existsSync(chemin)) { console.error('Référence absente : lancez d\'abord python3 tests/generer_reference.py'); process.exit(2); }
const R = JSON.parse(fs.readFileSync(chemin, 'utf8'));

let groupes = 0, echecs = 0;
function groupe(nom, f) {
  try { f(); groupes++; console.log('  ok   ' + nom); } catch (e) { echecs++; console.log('  ÉCHEC ' + nom + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); }
}
console.log('Parité sur : ' + R.source);

/* ---------- jeu de données ---------- */
const E = R.entree;
const clientsObj = H.objetsDepuisTableau({ colonnes: E.colonnes, lignes: E.clients });
const adressesObj = H.objetsDepuisTableau({ colonnes: E.adr_colonnes, lignes: E.adresses });
const suiviParCode = new Map(E.suivi.map((s) => [s.code_client, s]));
const base = clientsObj.map((c) => H.fusionnerClient(c, suiviParCode.get(String(c[E.colCode])), E.colCode));
const aujourdhui = R.aujourdhui;
const TRAITANTS = ['Chloé', 'Patricia', 'Quentin'];

groupe('priorité de tous les types de client', () => {
  Object.keys(R.priorite).forEach((t) => assert.strictEqual(H.priorite(t), R.priorite[t], 'type « ' + t + ' »'));
});

groupe('typologie d\'appel : toutes les fiches', () => {
  const diffs = [];
  base.forEach((b) => {
    const d = H.deviner(b), a = R.typologies[b._code];
    const js = [d.typologie, d.sous_type, d.motif, d.confiance];
    if (JSON.stringify(js) !== JSON.stringify(a)) diffs.push(b._code + ' JS=' + JSON.stringify(js) + ' PY=' + JSON.stringify(a));
  });
  assert.strictEqual(diffs.length, 0, diffs.length + ' écart(s) sur ' + base.length + '\n' + diffs.slice(0, 4).join('\n'));
  assert.deepStrictEqual([H.deviner(null), H.deviner({})].map((d) => [d.typologie, d.sous_type, d.motif, d.confiance]), R.typologie_vide);
});

groupe('file d\'appel : filtres et ordre identiques', () => {
  R.files.forEach((sc, i) => {
    const f = sc.filtres;
    const file = H.construireFile(base, { traitement: f.f_traitement, masquerOuvertes: f.occupees.length > 0, ouvertes: new Set(f.occupees), types: f.f_type, statuts: f.f_statut, aCompleter: f.f_acompl, recherche: f.recherche, tri: f.tri_priorite }, TRAITANTS);
    const js = file.map((r) => r._code);
    assert.strictEqual(js.length, sc.codes.length, 'scénario ' + i + ' : ' + js.length + ' fiches contre ' + sc.codes.length);
    for (let k = 0; k < js.length; k++) if (js[k] !== sc.codes[k]) assert.fail('scénario ' + i + ' : rang ' + k + ' : ' + js[k] + ' contre ' + sc.codes[k]);
  });
});

groupe('rappels dus et planifiés', () => {
  // L'ordre à date égale est indéterminé côté pandas (tri rapide non stable) : on compare à date puis code.
  const norm = (l) => l.slice().sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dates = (l) => l.map((x) => x[1]);
  [['Chloé', 'Chloé'], ['Patricia', 'Patricia'], ['Quentin', 'Quentin'], ['tous', null]].forEach(([k, u]) => {
    const dus = H.rappelsDus(base, u, aujourdhui).map((x) => [x.fiche._code, x.date]);
    assert.deepStrictEqual(norm(dus), norm(R.rappels_dus[k]), 'dus ' + k);
    assert.deepStrictEqual(dates(dus), dates(R.rappels_dus[k]), 'dates triées ' + k);
  });
  [['Chloé', 'Chloé'], ['Patricia', 'Patricia'], ['tous', null]].forEach(([k, u]) => {
    const p = H.rappelsPlanifies(base, u).map((x) => [x.fiche._code, x.date]);
    assert.deepStrictEqual(norm(p), norm(R.rappels_planifies[k]), 'planifiés ' + k);
    assert.deepStrictEqual(dates(p), dates(R.rappels_planifies[k]), 'dates triées ' + k);
  });
  R.classe_charge.forEach(([n, jour, attendu]) => assert.strictEqual(H.classeCharge(n, jour, aujourdhui), attendu, n + ' ' + jour));
});

groupe('rythme et statistiques par personne', () => {
  const suivi = E.suivi;
  Object.keys(R.rythme).forEach((k) => {
    const js = H.calculerRythme(suivi, k === 'tous' ? null : k), py = R.rythme[k];
    if (py === null) assert.strictEqual(js, null, k); else assert.ok(Math.abs(js - py) < 1e-9, k + ' : ' + js + ' contre ' + py);
  });
  Object.keys(R.stats).forEach((u) => {
    const s = H.statsUtilisateur(suivi, E.suivi_adr, u, R.compteurs), p = R.stats[u];
    ['fiches', 'terminees', 'aujourdhui', 'a_rappeler', 'points', 'points_aujourdhui'].forEach((c) => assert.strictEqual(s[c], p[c], u + ' ' + c));
    if (p.rythme === null) assert.strictEqual(s.rythme, null); else assert.ok(Math.abs(s.rythme - p.rythme) < 1e-9, u + ' rythme');
  });
});

groupe('jours ouvrés et échéance', () => {
  R.jours_ouvres.forEach(([a, b, n]) => assert.strictEqual(H.joursOuvres(a, b), n, a + ' → ' + b));
  R.apres_jours_ouvres.forEach(([a, n, attendu]) => assert.strictEqual(H.dateApresJoursOuvres(a, n), attendu, a + ' + ' + n));
});

groupe('lecture des dates', () => {
  Object.keys(R.vers_iso).forEach((t) => assert.strictEqual(H.versIso(t), R.vers_iso[t], '« ' + t + ' »'));
  assert.strictEqual(H.heureParis('2026-11-17T10:24:58', true), '17/11/2026 11:24');
  assert.strictEqual(H.heureParis('2026-07-01T10:00:00', true), '01/07/2026 12:00');
  assert.strictEqual(H.jolieDate('2026-12-15'), '15/12/2026');
});

groupe('restauration depuis les CSV d\'export', () => {
  assert.deepStrictEqual(H.lignesRestaurationClients(H.lireCsv(R.csv_clients.texte)), R.csv_clients.lignes);
  assert.deepStrictEqual(H.lignesRestaurationAdresses(H.lireCsv(R.csv_adresses.texte)), R.csv_adresses.lignes);
});

groupe('export clients et points de livraison', () => {
  const parCode = new Map(clientsObj.map((c) => [String(c[E.colCode]), c]));
  const rows = H.exportClients(E.suivi, parCode, E.colCode).map((l) => l.slice(0, 14));
  assert.deepStrictEqual(H.COLONNES_EXPORT_CLIENTS.slice(0, 14), R.export_clients.colonnes.slice(0, 14));
  assert.strictEqual(rows.length, R.export_clients.lignes.length);
  rows.forEach((l, i) => assert.deepStrictEqual(l.map(String), R.export_clients.lignes[i], 'ligne ' + i));
  const adr = H.exportAdresses(adressesObj, new Map(E.suivi_adr.map((s) => [s.code_adresse, s]))).map((l) => l.slice(0, 10));
  assert.deepStrictEqual(H.COLONNES_EXPORT_ADRESSES.slice(0, 10), R.export_adresses.colonnes.slice(0, 10));
  assert.strictEqual(adr.length, R.export_adresses.lignes.length);
  adr.forEach((l, i) => assert.deepStrictEqual(l.map(String), R.export_adresses.lignes[i], 'adresse ' + i));
});

groupe('reporting journalier des appels (7, 30 et 90 jours)', () => {
  ['7', '30', '90'].forEach((j) => {
    const js = H.rapportJournalier(R.appels, Number(j), aujourdhui), py = R.rapports[j];
    assert.strictEqual(js.vide, py.vide);
    if (py.vide) return;
    ['total', 'points', 'jours_actifs', 'hors_appels'].forEach((c) => assert.strictEqual(js[c], py[c], j + ' j : ' + c));
    assert.deepStrictEqual(js.personnes, py.personnes, j + ' j : personnes');
    assert.deepStrictEqual(js.tableau.map((l) => [l.jour].concat(js.personnes.map((p) => l[p]))), py.tableau, j + ' j : tableau');
    assert.deepStrictEqual(js.parStatut, py.par_statut, j + ' j : statuts');
  });
});

groupe('import d\'un classeur brut : normalisation identique', () => {
  if (!R.classeur) { console.log('       (classeur réel absent : groupe ignoré)'); return; }
  const c = R.classeur, n = H.normaliserClasseur(c.brut_c.colonnes, c.brut_c.lignes, c.brut_a.colonnes, c.brut_a.lignes);
  assert.strictEqual(n.colCode, c.col_code);
  assert.deepStrictEqual(n.clients.colonnes, c.norm_c.colonnes);
  assert.strictEqual(n.clients.lignes.length, c.norm_c.lignes.length);
  for (let i = 0; i < n.clients.lignes.length; i++) if (JSON.stringify(n.clients.lignes[i]) !== JSON.stringify(c.norm_c.lignes[i])) assert.fail('client ligne ' + i);
  assert.deepStrictEqual(n.adresses.colonnes, c.norm_a.colonnes);
  assert.strictEqual(n.adresses.lignes.length, c.norm_a.lignes.length);
  for (let i = 0; i < n.adresses.lignes.length; i++) if (JSON.stringify(n.adresses.lignes[i]) !== JSON.stringify(c.norm_a.lignes[i])) assert.fail('adresse ligne ' + i);
});

console.log('\n' + (echecs ? 'ÉCHEC : ' + echecs + ' groupe(s) en défaut sur ' + (groupes + echecs) : 'Parité Python ↔ JavaScript : ' + groupes + ' groupes de tests réussis, 0 en échec.'));
process.exit(echecs ? 1 : 0);
