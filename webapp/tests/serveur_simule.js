/* Serveur simulé de la fonction « fificli-api » (même contrat : comptes membres, rôles, jetons, suivi, tickets) pour tester l'application sans Supabase.
   Usage : node tests/serveur_simule.js [port]        (port par défaut 8781)
   Données : tests/local/clients.json et adresses.json s'ils existent (classeur réel, non versionné), sinon un jeu synthétique.
   Comptes : chloe@exemple.fr / secret-chloe-123 (commerciale) · patricia@exemple.fr / secret-patricia-123 (commerciale)
             mika@exemple.fr / secret-mika-1234 (manager) · quentin@exemple.fr / secret-quentin-123 (admin)
             bob@exemple.fr / secret-bob-1234 (compte Authentication mais non membre)
   Aides de test : GET /_etat · /_expirer · /_autre?type=client&code=…&nom=Patricia · /_saisie?code=…&nom=Patricia&statut=… · /_recup */
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORT = +process.argv[2] || 8781;

const comptes = {
  'chloe@exemple.fr': { mdp: 'secret-chloe-123', nom: 'Chloé', role: 'commercial' }, 'patricia@exemple.fr': { mdp: 'secret-patricia-123', nom: 'Patricia', role: 'commercial' },
  'mika@exemple.fr': { mdp: 'secret-mika-1234', nom: 'Mika', role: 'manager' }, 'quentin@exemple.fr': { mdp: 'secret-quentin-123', nom: 'Quentin', role: 'admin' },
  'bob@exemple.fr': { mdp: 'secret-bob-1234', nom: '', role: null }
};
const STATUTS = ['À appeler', 'À rappeler', 'Injoignable', 'Boudret', 'Fait ✅', 'Doublon', 'Ancien client (à sortir)'];
const STATUTS_ADR = ['À vérifier', 'Vérifié ✅', 'Adresse obsolète'];
const PROTEGES = ['existe', 'produits', 'email_maj', 'tel_maj', 'note', 'doublon_de', 'rappel_date', 'motif_sortie'];
const PROTEGES_ADR = ['referent', 'tel_site', 'note_adr'];

/* ---------- classeur ---------- */
function lireJson(f) { const p = path.join(__dirname, 'local', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
let clients = lireJson('clients.json'), adresses = lireJson('adresses.json');
if (clients) { const i = clients.colonnes.indexOf("— données d'origine —"); if (i >= 0) { clients.colonnes.splice(i, 1); clients.lignes.forEach((l) => l.splice(i, 1)); } }
if (adresses) { const i = adresses.colonnes.indexOf("— données d'origine —"); if (i >= 0) { adresses.colonnes.splice(i, 1); adresses.lignes.forEach((l) => l.splice(i, 1)); } }
if (!clients) {
  const types = ['Particulier', 'Particulier (déduit)', 'Pro', 'À déterminer', 'Pro (déduit)', 'Public/Asso'], noms = ['EARL DU MOULIN', 'MAIRIE DE PRADES', 'DUPONT JEAN', 'TRANSPORTS MARTIN', 'SARL TP SUD', 'GAEC LES PINS', 'MME DURAND', 'SYNDICAT DES EAUX', 'ETS LAMBERT', 'LEROY PAUL'];
  clients = { colonnes: ['Code Client', 'Type client', 'Catégorie', 'Raison sociale / Nom', 'Indicatif', 'SIREN', 'Email principal', 'Email secondaire', 'Téléphone 1', 'Téléphone 2', 'Téléphone 3', 'Adresse 1', 'Code postal', 'Ville', 'À compléter'], lignes: [] };
  for (let i = 0; i < 400; i++) clients.lignes.push([String(1000 + i), types[i % 6], '', noms[i % 10] + ' ' + i, '', i % 3 ? '412345678' : '', i % 4 ? 'client' + i + '@exemple.fr' : '', '', '0561' + (100000 + i), '', '', i + ' rue des Lilas', '81000', ['Albi', 'Gaillac', 'Carmaux'][i % 3], i % 5 ? '' : 'Téléphone manquant']);
  adresses = { colonnes: ['Code adresse', 'Code client mère', 'Nom site', 'Adresse 1', 'Adresse 2', 'Adresse 3', 'Code postal', 'Ville', 'Commune', 'Téléphone'], lignes: [] };
  for (let i = 0; i < 300; i += 3) for (let j = 1; j <= 2; j++) adresses.lignes.push([(1000 + i) + 'L' + j, String(1000 + i), 'Site ' + j + ' ' + noms[i % 10], i + ' route', '', '', '81000', 'Albi', '', '0561' + (200000 + i)]);
}
const classeur = { clients: { version: 1, nom_fichier: 'CLIENTS_HYMPYR (1).xlsx', importe_le: '2026-09-23T07:07:42Z', importe_par: 'reprise initiale', ...clients }, adresses: { version: 1, nom_fichier: 'CLIENTS_HYMPYR (1).xlsx', importe_le: '2026-09-23T07:07:42Z', importe_par: 'reprise initiale', ...adresses } };

/* ---------- état ---------- */
const maintenant = () => new Date().toISOString().slice(0, 19);
const jourUtc = () => new Date().toISOString().slice(0, 10);
const suivi = new Map(), suiviAdr = new Map(), appels = [], journal = [], verrous = [], meta = { dernier_export: '2026-11-13T15:57:35' }, tickets = [], acces = new Map(), rafraichir = new Map();
let ticketId = 1;
const jeton = () => crypto.randomBytes(16).toString('hex');
(function graine() {
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const choix = (a) => a[Math.floor(rnd() * a.length)];
  const n = Math.min(clients.lignes.length, 320);
  for (let i = 0; i < n; i++) {
    const l = clients.lignes[Math.floor(rnd() * clients.lignes.length)], code = String(l[0]);
    const statut = choix(['Fait ✅', 'Fait ✅', 'À rappeler', 'À rappeler', 'Injoignable', 'Boudret', 'Doublon', 'Ancien client (à sortir)']);
    const jour = new Date(Date.now() + (Math.floor(rnd() * 30) - 6) * 86400000).toISOString().slice(0, 10);
    const quand = new Date(Date.now() - Math.floor(rnd() * 20) * 86400000 - Math.floor(rnd() * 9) * 3600000).toISOString().slice(0, 19);
    suivi.set(code, { code_client: code, statut, existe: choix(['Oui', 'Oui', 'Non', 'Incertain']), produits: choix(['', 'GNR', 'HVO|AdBlue', 'Fioul domestique', 'Granulés de bois']), email_maj: '', tel_maj: '', note: choix(['', '', 'KBIS demandé par mail', '13/10 relance téléphone\n17/11 mail']), doublon_de: statut === 'Doublon' ? '1001' : '', rappel_date: statut === 'À rappeler' ? jour : '', motif_sortie: statut === 'Ancien client (à sortir)' ? 'Passé à la concurrence' : '', traite_par: choix(['Chloé', 'Patricia']), maj_le: quand });
  }
  suivi.forEach((r) => appels.push({ id: appels.length + 1, horodatage: r.maj_le, jour: r.maj_le.slice(0, 10), utilisateur: r.traite_par, type_fiche: 'client', code: r.code_client, statut: r.statut, origine: 'appel' }));
  for (let k = 0; k < 120; k++) { const j = new Date(Date.now() - Math.floor(rnd() * 28) * 86400000).toISOString().slice(0, 10); appels.push({ id: appels.length + 1, horodatage: j + 'T10:00:00', jour: j, utilisateur: choix(['Chloé', 'Patricia']), type_fiche: 'client', code: String(1000 + Math.floor(rnd() * 90)), statut: choix(['Fait ✅', 'À rappeler', 'Injoignable']), origine: 'appel' }); }
  adresses.lignes.slice(0, 40).forEach((l, i) => { if (i % 3) suiviAdr.set(l[0], { code_adresse: l[0], referent: choix(['Paul Roux', 'Mme Garcia', '']), tel_site: '', statut_adr: choix(STATUTS_ADR), note_adr: '', traite_par: choix(['Chloé', 'Patricia']), maj_le: maintenant() }); });
  journal.push({ horodatage: '2026-10-30T10:54:48', auteur: 'Quentin', action: 'Réattribution de fiche', cible: '1625', detail: 'traité par « personne » → « Chloé » ; statut « À appeler » → « À appeler »' });
})();

const membre = (email) => { const c = comptes[email]; return c && c.role ? { email, nom: c.nom, role: c.role } : null; };
const membresListe = () => Object.keys(comptes).map(membre).filter(Boolean).map((m) => ({ nom: m.nom, role: m.role })).sort((a, b) => a.nom.localeCompare(b.nom));
function ouvrir(email) { const a = jeton(), r = jeton(), m = membre(email); acces.set(a, email); rafraichir.set(r, email); return { access_token: a, refresh_token: r, expires_in: 3600, email, nom: m.nom, role: m.role }; }

function commun(m, depuisSuivi, depuisAdr) {
  const lim = new Date(Date.now() - 12 * 60000).toISOString().slice(0, 19);
  const vus = new Set(), compteurs = {};
  appels.filter((a) => a.jour === jourUtc() && a.origine === 'appel').forEach((a) => { const k = a.utilisateur + '|' + a.type_fiche + '|' + a.code; if (vus.has(k)) return; vus.add(k); const c = a.utilisateur + '|' + a.type_fiche; compteurs[c] = (compteurs[c] || 0) + 1; });
  return {
    suivi: [...suivi.values()].filter((r) => !depuisSuivi || r.maj_le > depuisSuivi), suivi_adresses: [...suiviAdr.values()].filter((r) => !depuisAdr || r.maj_le > depuisAdr),
    verrous: verrous.filter((v) => v.depuis >= lim && v.utilisateur !== m.nom).map((v) => ({ type_fiche: v.type_fiche, code: v.code, utilisateur: v.utilisateur, depuis: v.depuis })),
    compteurs, dernier_export: meta.dernier_export || '', derniere_fiche: meta['derniere_fiche_' + m.nom] || ''
  };
}
function fusion(ancien, champs, proteges, efface, utilisateur, cleCode, code) {
  const nouveau = Object.assign({}, ancien || {});
  Object.keys(champs).forEach((k) => { let v = champs[k] === null || champs[k] === undefined ? '' : String(champs[k]); if (!v.trim() && proteges.includes(k) && !efface.includes(k) && (ancien || {})[k]) v = ancien[k]; nouveau[k] = v; });
  nouveau[cleCode] = code; nouveau.maj_le = maintenant();
  if (utilisateur || efface.includes('traite_par')) nouveau.traite_par = utilisateur || '';
  return nouveau;
}

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const rep = (s, o) => { res.writeHead(s, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const refus = (s, code, message) => rep(s, { code, message });
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/_etat') return rep(200, { suivi: suivi.size, adresses: suiviAdr.size, appels: appels.length, tickets, verrous, journal: journal.length, meta });
  if (u.pathname === '/_expirer') { acces.clear(); return rep(200, { ok: 1 }); }
  if (u.pathname === '/_recup') { const j = jeton(); acces.set(j, 'chloe@exemple.fr'); return rep(200, { access_token: j }); }
  if (u.pathname === '/_autre') { verrous.push({ type_fiche: u.searchParams.get('type') || 'client', code: u.searchParams.get('code'), utilisateur: u.searchParams.get('nom') || 'Patricia', depuis: maintenant() }); return rep(200, { ok: 1 }); }
  if (u.pathname === '/_saisie') { const code = u.searchParams.get('code'), nom = u.searchParams.get('nom') || 'Patricia'; const r = fusion(suivi.get(code), { statut: u.searchParams.get('statut') || 'Injoignable' }, PROTEGES, [], nom, 'code_client', code); suivi.set(code, r); appels.push({ id: appels.length + 1, horodatage: maintenant(), jour: jourUtc(), utilisateur: nom, type_fiche: 'client', code, statut: r.statut, origine: 'appel' }); return rep(200, { ok: 1 }); }
  const morceaux = []; req.on('data', (d) => morceaux.push(d)); req.on('end', () => {
    let c; try { c = JSON.parse(Buffer.concat(morceaux).toString() || '{}'); } catch (e) { return refus(400, 'requete', 'JSON invalide.'); }
    if (c.action === 'login') { const k = String(c.email || '').toLowerCase(), cp = comptes[k]; if (!cp || cp.mdp !== c.password || !cp.role) return setTimeout(() => refus(401, 'auth', 'Identifiants incorrects.'), 300); return rep(200, ouvrir(k)); }
    if (c.action === 'refresh') { const k = rafraichir.get(c.refresh_token); if (!k) return refus(401, 'auth', 'Session expirée.'); rafraichir.delete(c.refresh_token); return rep(200, ouvrir(k)); }
    if (c.action === 'recover') return rep(200, { ok: true });
    const email = acces.get((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); if (!email) return refus(401, 'auth', 'Session expirée : reconnectez-vous.');
    const m = membre(email); if (!m) return refus(403, 'membre', 'Ce compte n\'est pas autorisé à utiliser le cockpit.');
    const traite = m.role === 'commercial' || m.role === 'admin', pilote = m.role === 'manager' || m.role === 'admin';
    const interdit = () => refus(403, 'droits', 'Votre profil ne permet pas cette action.');
    switch (c.action) {
      case 'password': if (typeof c.password !== 'string' || c.password.length < 10) return refus(400, 'requete', 'Le mot de passe doit contenir au moins 10 caractères.'); comptes[email].mdp = c.password; return rep(200, { ok: true });
      case 'bootstrap': {
        const piece = (cle) => (Number(c.classeur && c.classeur[cle]) === classeur[cle].version ? { inchange: true, version: classeur[cle].version } : classeur[cle]);
        return rep(200, { serveur_le: maintenant(), moi: m, membres: membresListe(), classeur: { clients: piece('clients'), adresses: piece('adresses') }, commun: commun(m) });
      }
      case 'delta': return rep(200, { serveur_le: maintenant(), commun: commun(m, c.since, c.since_adr), n_suivi: suivi.size, n_adr: suiviAdr.size });
      case 'fiche_enregistrer': {
        if (!traite) return interdit();
        const ch = c.champs || {}; if (ch.statut !== undefined && !STATUTS.includes(ch.statut)) return refus(400, 'requete', 'Statut inconnu.');
        const r = fusion(suivi.get(c.code), ch, PROTEGES, c.effacements || [], m.nom, 'code_client', String(c.code)); suivi.set(String(c.code), r);
        appels.push({ id: appels.length + 1, horodatage: r.maj_le, jour: r.maj_le.slice(0, 10), utilisateur: m.nom, type_fiche: 'client', code: String(c.code), statut: r.statut, origine: 'appel' });
        if (c.code === 'ERREUR') return refus(502, 'base', 'Enregistrement impossible.');
        return rep(200, { fiche: r, serveur_le: maintenant() });
      }
      case 'adresse_enregistrer': {
        if (!traite) return interdit();
        const ch = c.champs || {}; if (ch.statut_adr !== undefined && !STATUTS_ADR.includes(ch.statut_adr)) return refus(400, 'requete', 'Statut inconnu.');
        const r = fusion(suiviAdr.get(c.code), ch, PROTEGES_ADR, c.effacements || [], m.nom, 'code_adresse', String(c.code)); suiviAdr.set(String(c.code), r);
        appels.push({ id: appels.length + 1, horodatage: r.maj_le, jour: r.maj_le.slice(0, 10), utilisateur: m.nom, type_fiche: 'adresse', code: String(c.code), statut: r.statut_adr, origine: 'appel' });
        return rep(200, { fiche: r, serveur_le: maintenant() });
      }
      case 'reattribuer': {
        if (m.role !== 'admin') return interdit(); const code = String(c.code), ancien = suivi.get(code) || {};
        const r = Object.assign({}, ancien, { code_client: code, statut: c.statut, traite_par: c.traitant || '', maj_le: maintenant() }); suivi.set(code, r);
        journal.unshift({ horodatage: maintenant(), auteur: m.nom, action: 'Réattribution de fiche', cible: code, detail: 'traité par « ' + (ancien.traite_par || 'personne') + ' » → « ' + (c.traitant || 'personne') + ' »' });
        appels.push({ id: appels.length + 1, horodatage: r.maj_le, jour: r.maj_le.slice(0, 10), utilisateur: m.nom, type_fiche: 'client', code, statut: c.statut, origine: 'reattribution' });
        return rep(200, { fiche: r });
      }
      case 'presence': if (!traite) return interdit(); verrous.push({ type_fiche: c.type, code: String(c.code), utilisateur: m.nom, depuis: maintenant() }); meta['derniere_fiche_' + m.nom] = String(c.code); return rep(200, { ok: true });
      case 'export_confirmer': if (!traite) return interdit(); meta.dernier_export = maintenant(); return rep(200, { dernier_export: meta.dernier_export });
      case 'rapport': { if (!pilote) return interdit(); const j = Math.max(1, Math.min(Number(c.jours) || 30, 365)), depuis = new Date(Date.now() - (j - 1) * 86400000).toISOString().slice(0, 10); return rep(200, { depuis, appels: appels.filter((a) => a.jour >= depuis), journal: journal.slice(0, 200) }); }
      case 'reinitialiser': if (m.role !== 'manager') return interdit(); if (c.confirmation !== 'RESET') return refus(400, 'requete', 'Confirmation manquante.'); suivi.clear(); suiviAdr.clear(); appels.length = 0; journal.length = 0; return rep(200, { ok: true });
      case 'ticket_creer': {
        if (!['probleme', 'suggestion', 'question'].includes(c.type) || String(c.sujet || '').trim().length < 3 || String(c.message || '').trim().length < 3) return refus(400, 'requete', 'Ticket invalide.');
        const t = { id: ticketId++, cree_le: new Date().toISOString(), auteur_nom: m.nom, auteur_email: m.email, type: c.type, sujet: c.sujet, message: c.message, page: c.page || '', contexte: c.contexte || {}, statut: 'nouveau', reponse: '', traite_par: '', maj_le: new Date().toISOString() };
        tickets.unshift(t); return rep(200, { id: t.id, cree_le: t.cree_le });
      }
      case 'ticket_lister': return rep(200, { tickets: (pilote ? tickets : tickets.filter((t) => t.auteur_email === m.email)).map(({ auteur_email, contexte, ...t }) => t), tous: pilote });
      case 'ticket_maj': { if (!pilote) return interdit(); const t = tickets.find((x) => x.id === c.id); if (!t) return refus(400, 'requete', 'Ticket inconnu.'); if (c.statut) t.statut = c.statut; if (c.reponse !== undefined) t.reponse = c.reponse; t.traite_par = m.nom; t.maj_le = new Date().toISOString(); return rep(200, { ok: true }); }
      case 'classeur_ajouter': if (m.role !== 'admin') return interdit(); classeur.__transit = classeur.__transit || {}; { const k = c.cle; if (c.debut) classeur.__transit[k] = { colonnes: c.colonnes, lignes: [], nom: c.nom }; classeur.__transit[k].lignes.push(...c.lignes); return rep(200, { recues: classeur.__transit[k].lignes.length }); }
      case 'classeur_publier': { if (m.role !== 'admin') return interdit(); const t = classeur.__transit && classeur.__transit[c.cle]; if (!t || t.lignes.length !== c.attendu) return refus(502, 'base', 'Publication impossible : import incomplet.'); classeur[c.cle] = { version: classeur[c.cle].version + 1, nom_fichier: t.nom, importe_le: new Date().toISOString(), importe_par: m.nom, colonnes: t.colonnes, lignes: t.lignes }; return rep(200, { version: classeur[c.cle].version }); }
      case 'restaurer': { if (m.role !== 'admin') return interdit(); let n = 0; (c.lignes || []).forEach((l) => { if (c.type === 'adresse') suiviAdr.set(l.code, fusion(suiviAdr.get(l.code), l.champs, PROTEGES_ADR, ['referent', 'tel_site', 'note_adr', 'traite_par'], l.traite_par, 'code_adresse', l.code)); else suivi.set(l.code, fusion(suivi.get(l.code), l.champs, PROTEGES, [...PROTEGES, 'traite_par'], l.traite_par, 'code_client', l.code)); n++; }); return rep(200, { restaurees: n }); }
      default: return refus(400, 'requete', 'Action inconnue.');
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log('serveur simulé sur ' + PORT + ' · ' + clients.lignes.length + ' clients, ' + adresses.lignes.length + ' points de livraison, ' + suivi.size + ' fiches suivies'));
