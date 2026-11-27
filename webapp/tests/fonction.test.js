/* Test de la fonction Edge réelle (supabase/functions/fificli-api/index.ts) dans Node, contre un faux Supabase en mémoire
   (Auth + PostgREST + fonctions SQL simplifiées). Vérifie le routage, l'authentification, les droits par rôle, la pagination,
   l'assemblage du chargement initial et les validations.   Usage : node tests/fonction.test.js */
const assert = require('assert'), path = require('path');

/* ---------- faux Supabase ---------- */
const URL_ = 'https://faux.supabase.test';
const t = { fificli_membres: [], fificli_classeur: [], suivi: [], suivi_adresses: [], verrous: [], appels: [], meta: [], journal: [], fificli_tickets: [], historique: [] };
const comptes = { 'chloe@exemple.fr': 'mdp-chloe-12345', 'mika@exemple.fr': 'mdp-mika-12345', 'quentin@exemple.fr': 'mdp-quentin-123', 'bob@exemple.fr': 'mdp-bob-123456' };
const jetons = new Map();
t.fificli_membres.push({ email: 'chloe@exemple.fr', nom: 'Chloé', role: 'commercial', actif: true }, { email: 'mika@exemple.fr', nom: 'Mika', role: 'manager', actif: true }, { email: 'quentin@exemple.fr', nom: 'Quentin', role: 'admin', actif: true });
t.fificli_classeur.push({ cle: 'clients', version: 3, nom_fichier: 'x.xlsx', importe_le: '2026-09-23T07:07:42Z', importe_par: 'test', colonnes: ['Code Client', 'Raison sociale / Nom'], lignes: [['1', 'ALPHA "SA"'], ['2', 'Bêta, é\nligne']] },
  { cle: 'adresses', version: 1, nom_fichier: 'x.xlsx', importe_le: '2026-09-23T07:07:42Z', importe_par: 'test', colonnes: ['Code adresse', 'Code client mère'], lignes: [['1L1', '1']] });
for (let i = 0; i < 1500; i++) t.suivi.push({ code_client: 'C' + String(i).padStart(5, '0'), statut: 'À appeler', traite_par: 'Chloé', maj_le: '2026-11-17T10:' + String(i % 60).padStart(2, '0') + ':00' });
const aujourdhui = new Date().toISOString().slice(0, 10);
for (let i = 0; i < 2500; i++) t.appels.push({ id: i + 1, jour: aujourdhui, utilisateur: i % 2 ? 'Chloé' : 'Quentin', type_fiche: 'client', code: 'C' + (i % 1200), statut: 'Fait ✅', origine: 'appel', horodatage: aujourdhui + 'T10:00:00' });
t.meta.push({ cle: 'dernier_export', valeur: '2026-11-13T15:57:35' }, { cle: 'derniere_fiche_Chloé', valeur: 'C00042' });
t.verrous.push({ cle: 'client:C00001:Quentin', type_fiche: 'client', code: 'C00001', utilisateur: 'Quentin', depuis: new Date().toISOString().slice(0, 19) });
let idTicket = 1;

function filtrer(table, params) {
  let lignes = t[table].slice();
  for (const [k, v] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    const [op, ...reste] = v.split('.'), val = reste.join('.');
    const valeur = (l) => (l[k] === null || l[k] === undefined ? '' : String(l[k]));
    if (op === 'eq') lignes = lignes.filter((l) => valeur(l) === val);
    else if (op === 'neq') lignes = lignes.filter((l) => valeur(l) !== val);
    else if (op === 'gt') lignes = lignes.filter((l) => valeur(l) > val);
    else if (op === 'gte') lignes = lignes.filter((l) => valeur(l) >= val);
    else if (op === 'in') { const liste = val.replace(/^\(|\)$/g, '').split(','); lignes = lignes.filter((l) => liste.includes(valeur(l))); }
    else throw new Error('opérateur inconnu ' + op);
  }
  const ordre = params.get('order');
  if (ordre) { const [col, sens] = ordre.split('.'); lignes.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (sens === 'desc' ? -1 : 1)); }
  return lignes;
}
const json = (o, s = 200, h = {}) => (s === 204 ? new Response(null, { status: 204, headers: h }) : new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } }));
async function fauxFetch(url, init = {}) {
  const u = new URL(url), corps = init.body ? JSON.parse(init.body) : null, entetes = new Headers(init.headers || {});
  if (u.pathname.startsWith('/auth/v1/token')) {
    const mdp = comptes[corps.email];
    if (u.searchParams.get('grant_type') === 'password') { if (mdp !== corps.password) return json({ error: 'invalid' }, 400); const a = 'A' + Math.random(), r = 'R' + Math.random(); jetons.set(a, corps.email); jetons.set(r, corps.email); return json({ access_token: a, refresh_token: r, expires_in: 3600, user: { email: corps.email } }); }
    const e = jetons.get(corps.refresh_token); if (!e) return json({}, 400); const a = 'A' + Math.random(); jetons.set(a, e); return json({ access_token: a, refresh_token: 'R' + Math.random(), expires_in: 3600, user: { email: e } });
  }
  if (u.pathname === '/auth/v1/user') {
    const e = jetons.get((entetes.get('authorization') || '').replace(/^Bearer\s+/i, '')); if (!e) return json({}, 401);
    if (init.method === 'PUT') { comptes[e] = corps.password; return json({ email: e }); }
    return json({ email: e, email_confirmed_at: '2026-01-01' });
  }
  if (u.pathname === '/auth/v1/recover') { t.recover = corps.email; return json({}); }
  if (!u.pathname.startsWith('/rest/v1/')) return json({}, 404);
  const chemin = u.pathname.replace('/rest/v1/', '');
  if (chemin === 'rpc/fificli_reprogrammer_rappels') {
    // appelée avec le jeton de la personne (clé publique + Bearer utilisateur) : la base lit l'identité dans le jeton
    const e = jetons.get((entetes.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    t.rpcPersonne = { apikey: entetes.get('apikey'), email: e, corps };
    if (entetes.get('apikey') !== 'cle-anon' || !e) return json({ message: 'JWT invalide' }, 401);
    if (corps.p_codes.includes('REFUS')) return json({ code: '42501', message: 'Votre profil ne permet pas de reprogrammer des rappels.' }, 403);
    if (corps.p_vers < '2000-01-01') return json({ code: '22023', message: 'La nouvelle date ne peut pas être dans le passé.' }, 400);
    return json({ fiches: corps.p_codes.map((c) => ({ code_client: c, rappel_date: corps.p_vers })), ignores: [], serveur_le: '2026-11-27T10:00:00' });
  }
  if (entetes.get('apikey') !== 'cle-serveur') return json({ message: 'clé refusée' }, 401);
  if (chemin.startsWith('rpc/')) {
    const nom = chemin.slice(4);
    if (nom === 'fificli_enregistrer_fiche') {
      const ancien = t.suivi.find((s) => s.code_client === corps.p_code) || {}; const nouveau = Object.assign({}, ancien, corps.p_champs, { code_client: corps.p_code, maj_le: '2026-11-17T12:00:00', traite_par: corps.p_utilisateur });
      Object.keys(corps.p_champs).forEach((k) => { if (!String(corps.p_champs[k]).trim() && ancien[k] && !corps.p_effacements.includes(k) && ['note', 'produits'].includes(k)) nouveau[k] = ancien[k]; });
      t.suivi = t.suivi.filter((s) => s.code_client !== corps.p_code).concat([nouveau]); t.appels.push({ id: t.appels.length + 1, jour: aujourdhui, utilisateur: corps.p_utilisateur, type_fiche: 'client', code: corps.p_code, statut: nouveau.statut, origine: 'appel' }); return json(nouveau);
    }
    if (nom === 'fificli_poser_verrou') { t.verrous.push({ type_fiche: corps.p_type, code: corps.p_code, utilisateur: corps.p_utilisateur, depuis: new Date().toISOString().slice(0, 19) }); return json(null, 204); }
    if (nom === 'fificli_reinitialiser') { t.suivi = []; return json(null, 204); }
    if (nom === 'fificli_classeur_ajouter') { t.transit = (corps.p_debut ? [] : t.transit || []).concat(corps.p_lignes); return json(t.transit.length); }
    if (nom === 'fificli_classeur_publier') { if (t.transit.length !== corps.p_attendu) return json({ message: 'incomplet' }, 400); return json(4); }
    return json({}, 404);
  }
  if (init.method === 'POST') {
    if (chemin === 'fificli_tickets') { const l = Object.assign({ id: idTicket++, cree_le: new Date().toISOString(), statut: 'nouveau', reponse: '', traite_par: '' }, corps); t.fificli_tickets.push(l); return json([l], 201); }
    if (chemin === 'meta') { corps.forEach((m) => { const e = t.meta.find((x) => x.cle === m.cle); if (e) e.valeur = m.valeur; else t.meta.push(m); }); return json(null, 201); }
  }
  if (init.method === 'PATCH') { filtrer(chemin, u.searchParams).forEach((l) => Object.assign(l, corps)); return json(null, 204); }
  let lignes = filtrer(chemin, u.searchParams);
  const total = lignes.length, off = +u.searchParams.get('offset') || 0, lim = u.searchParams.get('limit') ? +u.searchParams.get('limit') : 1000;
  lignes = lignes.slice(off, off + Math.min(lim, 1000));
  const sel = u.searchParams.get('select');
  if (sel && sel !== '*') { const cols = sel.split(','); lignes = lignes.map((l) => { const o = {}; cols.forEach((c) => { o[c] = l[c]; }); return o; }); }
  const rg = entetes.get('range'); if (rg) lignes = lignes.slice(0, 1);
  const h = (entetes.get('prefer') || '').includes('count=exact') ? { 'content-range': (total ? `0-${Math.max(0, lignes.length - 1)}` : '*') + '/' + total } : {};
  if ((entetes.get('accept') || '').includes('pgrst.object')) return lignes.length === 1 ? json(lignes[0]) : json({ message: 'attendu 1 ligne' }, 406);
  return json(lignes, 200, h);
}

/* ---------- chargement de la vraie fonction ---------- */
let gestionnaire = null;
const env = { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: 'cle-anon', SUPABASE_SERVICE_ROLE_KEY: 'cle-serveur', FIFICLI_ALLOWED_ORIGIN: 'http://127.0.0.1:8800/' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (f) => { gestionnaire = f; } };
globalThis.fetch = fauxFetch;
const appeler = async (corps, jeton, origine) => {
  const entetes = { 'Content-Type': 'application/json' }; if (jeton) entetes.Authorization = 'Bearer ' + jeton; if (origine) entetes.Origin = origine;
  const r = await gestionnaire(new Request('https://f.test/functions/v1/fificli-api', { method: 'POST', headers: entetes, body: JSON.stringify(corps) }));
  const texte = await r.text(); let j = null; try { j = JSON.parse(texte); } catch (e) {}
  return { statut: r.status, json: j, texte, entetes: r.headers };
};
const connexion = async (email) => (await appeler({ action: 'login', email, password: comptes[email] })).json;

(async () => {
  await import('file://' + path.join(__dirname, '..', 'supabase', 'functions', 'fificli-api', 'index.ts'));
  assert.ok(gestionnaire, 'la fonction doit s\'enregistrer');
  let groupes = 0, echecs = 0;
  const groupe = async (nom, f) => { try { await f(); groupes++; console.log('  ok   ' + nom); } catch (e) { echecs++; console.log('  ÉCHEC ' + nom + '\n        ' + String(e.message).split('\n').slice(0, 5).join('\n        ')); } };

  await groupe('en-têtes CORS et requête OPTIONS', async () => {
    const r = await gestionnaire(new Request('https://f.test/x', { method: 'OPTIONS' }));
    assert.strictEqual(r.status, 204); assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://hympyr-energies.github.io');
    const o = (origine) => gestionnaire(new Request('https://f.test/x', { method: 'OPTIONS', headers: { Origin: origine } })).then((x) => x.headers.get('access-control-allow-origin'));
    assert.strictEqual(await o('https://hympyr-energies.github.io'), 'https://hympyr-energies.github.io');
    assert.strictEqual(await o('http://127.0.0.1:8800'), 'http://127.0.0.1:8800', 'origine supplémentaire de la variable renvoyée telle quelle');
    assert.strictEqual(await o('https://pirate.example'), 'https://hympyr-energies.github.io', 'origine inconnue : jamais renvoyée');
    const p = await gestionnaire(new Request('https://f.test/x', { method: 'POST', headers: { Origin: 'http://127.0.0.1:8800' }, body: '{' }));
    assert.strictEqual(p.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8800', 'aussi sur les réponses JSON');
    assert.strictEqual((await gestionnaire(new Request('https://f.test/x', { method: 'GET' }))).status, 405);
  });
  await groupe('connexion : membre, non-membre, mauvais mot de passe, même message', async () => {
    const ok = await appeler({ action: 'login', email: 'Chloe@Exemple.fr ', password: comptes['chloe@exemple.fr'] });
    assert.strictEqual(ok.statut, 200); assert.deepStrictEqual([ok.json.email, ok.json.nom, ok.json.role], ['chloe@exemple.fr', 'Chloé', 'commercial']); assert.ok(ok.json.access_token && ok.json.refresh_token);
    const bob = await appeler({ action: 'login', email: 'bob@exemple.fr', password: comptes['bob@exemple.fr'] }), faux = await appeler({ action: 'login', email: 'chloe@exemple.fr', password: 'faux' });
    assert.strictEqual(bob.statut, 401); assert.strictEqual(faux.statut, 401); assert.strictEqual(bob.json.message, faux.json.message);
  });
  await groupe('renouvellement de session et récupération du mot de passe', async () => {
    const s = await connexion('chloe@exemple.fr'), r = await appeler({ action: 'refresh', refresh_token: s.refresh_token });
    assert.strictEqual(r.statut, 200); assert.strictEqual((await appeler({ action: 'refresh', refresh_token: 'mauvais' })).statut, 401);
    assert.strictEqual((await appeler({ action: 'recover', email: 'chloe@exemple.fr' })).statut, 200); assert.strictEqual(t.recover, 'chloe@exemple.fr');
    t.recover = null; assert.strictEqual((await appeler({ action: 'recover', email: 'inconnu@exemple.fr' })).statut, 200); assert.strictEqual(t.recover, null);
  });
  await groupe('accès sans jeton ou avec jeton invalide refusé', async () => {
    assert.strictEqual((await appeler({ action: 'bootstrap' })).statut, 401); assert.strictEqual((await appeler({ action: 'bootstrap' }, 'faux')).statut, 401);
    const s = await connexion('chloe@exemple.fr'); t.fificli_membres.find((m) => m.email === 'chloe@exemple.fr').actif = false;
    const lim = await appeler({ action: 'bootstrap' }, s.access_token); t.fificli_membres.find((m) => m.email === 'chloe@exemple.fr').actif = true;
    assert.strictEqual(lim.statut, 403);
  });
  let bootstrap;
  await groupe('chargement initial : JSON valide, classeur recopié tel quel, suivi paginé, compteurs', async () => {
    const s = await connexion('chloe@exemple.fr'), r = await appeler({ action: 'bootstrap', classeur: {} }, s.access_token);
    assert.strictEqual(r.statut, 200); bootstrap = r.json;
    assert.deepStrictEqual(bootstrap.moi, { email: 'chloe@exemple.fr', nom: 'Chloé', role: 'commercial' });
    assert.deepStrictEqual(bootstrap.membres.map((m) => m.nom), ['Chloé', 'Mika', 'Quentin']);
    assert.strictEqual(bootstrap.classeur.clients.version, 3); assert.deepStrictEqual(bootstrap.classeur.clients.lignes[1], ['2', 'Bêta, é\nligne']); assert.strictEqual(bootstrap.classeur.clients.lignes[0][1], 'ALPHA "SA"');
    assert.strictEqual(bootstrap.commun.suivi.length, 1500, 'pagination au-delà de 1000 lignes');
    const attendu = new Set(t.appels.filter((a) => a.utilisateur === 'Chloé').map((a) => a.code)).size; assert.strictEqual(bootstrap.commun.compteurs['Chloé|client'], attendu, 'clients distincts, pas enregistrements');
    assert.strictEqual(bootstrap.commun.dernier_export, '2026-11-13T15:57:35'); assert.strictEqual(bootstrap.commun.derniere_fiche, 'C00042');
    assert.strictEqual(bootstrap.commun.verrous.length, 1); assert.strictEqual(bootstrap.commun.verrous[0].utilisateur, 'Quentin');
  });
  await groupe('chargement initial : classeur inchangé non renvoyé', async () => {
    const s = await connexion('chloe@exemple.fr'), r = await appeler({ action: 'bootstrap', classeur: { clients: 3, adresses: 1 } }, s.access_token);
    assert.deepStrictEqual(r.json.classeur.clients, { inchange: true, version: 3 }); assert.deepStrictEqual(r.json.classeur.adresses, { inchange: true, version: 1 });
    const v = await appeler({ action: 'bootstrap', classeur: { clients: 2, adresses: 1 } }, s.access_token); assert.ok(v.json.classeur.clients.lignes, 'version différente : classeur renvoyé');
  });
  await groupe('actualisation légère : uniquement les fiches modifiées, totaux', async () => {
    const s = await connexion('chloe@exemple.fr'), r = await appeler({ action: 'delta', since: '2026-11-17T10:58:00', since_adr: '' }, s.access_token);
    assert.strictEqual(r.statut, 200); assert.ok(r.json.commun.suivi.length > 0 && r.json.commun.suivi.length < 1500); assert.ok(r.json.commun.suivi.every((x) => x.maj_le > '2026-11-17T10:58:00'));
    assert.strictEqual(r.json.n_suivi, 1500);
  });
  await groupe('enregistrement d\'une fiche : droits, validation, effet', async () => {
    const c = await connexion('chloe@exemple.fr'), m = await connexion('mika@exemple.fr');
    assert.strictEqual((await appeler({ action: 'fiche_enregistrer', code: 'C00001', champs: { statut: 'Fait ✅' } }, m.access_token)).statut, 403, 'le manager ne saisit pas');
    assert.strictEqual((await appeler({ action: 'fiche_enregistrer', code: 'C00001', champs: { statut: 'Inventé' } }, c.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'fiche_enregistrer', code: '', champs: {} }, c.access_token)).statut, 400);
    const ok = await appeler({ action: 'fiche_enregistrer', code: 'C00001', champs: { statut: 'À rappeler', rappel_date: '2026-12-15', note: 'x' }, effacements: [] }, c.access_token);
    assert.strictEqual(ok.statut, 200); assert.strictEqual(ok.json.fiche.traite_par, 'Chloé', 'l\'auteur est le membre connecté, pas une valeur envoyée par la page');
  });
  await groupe('réattribution : administrateur seulement, personne connue', async () => {
    const a = await connexion('quentin@exemple.fr'), c = await connexion('chloe@exemple.fr');
    t.rpc = []; assert.strictEqual((await appeler({ action: 'reattribuer', code: 'C00001', traitant: 'Chloé', statut: 'À appeler' }, c.access_token)).statut, 403);
    assert.strictEqual((await appeler({ action: 'reattribuer', code: 'C00001', traitant: 'Inconnu', statut: 'À appeler' }, a.access_token)).statut, 400);
  });
  await groupe('reprogrammation des rappels : jeton de la personne transmis à la base, validations, erreurs', async () => {
    const c = await connexion('chloe@exemple.fr'), m = await connexion('mika@exemple.fr');
    t.rpcPersonne = null;
    assert.strictEqual((await appeler({ action: 'rappels_reprogrammer', codes: ['C1'], de: '2026-12-01', vers: '2026-12-05' }, m.access_token)).statut, 403, 'manager refusé');
    assert.strictEqual(t.rpcPersonne, null, 'refus avant tout appel à la base');
    assert.strictEqual((await appeler({ action: 'rappels_reprogrammer', codes: [], de: '2026-12-01', vers: '2026-12-05' }, c.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'rappels_reprogrammer', codes: ['C1'], de: '01/12/2026', vers: '2026-12-05' }, c.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'rappels_reprogrammer', codes: ['C1'], de: '2026-12-01', vers: 'demain' }, c.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'rappels_reprogrammer', codes: Array(1001).fill('C'), de: '2026-12-01', vers: '2026-12-05' }, c.access_token)).statut, 400);
    const ok = await appeler({ action: 'rappels_reprogrammer', codes: ['C1', ' C2 ', 3], de: '2026-12-01', vers: '2026-12-05' }, c.access_token);
    assert.strictEqual(ok.statut, 200); assert.deepStrictEqual(ok.json.fiches.map((f) => f.code_client), ['C1', 'C2']);
    assert.strictEqual(t.rpcPersonne.apikey, 'cle-anon', 'jamais la clé serveur'); assert.strictEqual(t.rpcPersonne.email, 'chloe@exemple.fr', 'jeton de la personne connectée');
    assert.deepStrictEqual(t.rpcPersonne.corps, { p_codes: ['C1', 'C2'], p_de: '2026-12-01', p_vers: '2026-12-05' });
    const retard = await appeler({ action: 'rappels_reprogrammer', codes: ['C1'], de: 'retard', vers: '2026-12-05' }, c.access_token);
    assert.strictEqual(retard.statut, 200); assert.strictEqual(t.rpcPersonne.corps.p_de, null, '« en retard » : pas de jour d\'origine');
    const refuse = await appeler({ action: 'rappels_reprogrammer', codes: ['REFUS'], de: '2026-12-01', vers: '2026-12-05' }, c.access_token);
    assert.strictEqual(refuse.statut, 403); assert.match(refuse.json.message, /profil/);
    const passe = await appeler({ action: 'rappels_reprogrammer', codes: ['C1'], de: '2026-12-01', vers: '1999-01-01' }, c.access_token);
    assert.strictEqual(passe.statut, 400); assert.match(passe.json.message, /passé/);
  });
  await groupe('pilotage : rapport réservé au manager et à l\'administrateur', async () => {
    const c = await connexion('chloe@exemple.fr'), m = await connexion('mika@exemple.fr');
    assert.strictEqual((await appeler({ action: 'rapport', jours: 30 }, c.access_token)).statut, 403);
    const r = await appeler({ action: 'rapport', jours: 7 }, m.access_token); assert.strictEqual(r.statut, 200); assert.strictEqual(r.json.appels.length, t.appels.length, 'toutes les lignes de la période, au-delà de 1000'); assert.ok(r.json.appels.length > 2000);
  });
  await groupe('réinitialisation : manager seul, confirmation obligatoire', async () => {
    const a = await connexion('quentin@exemple.fr'), m = await connexion('mika@exemple.fr'), n = t.suivi.length;
    assert.strictEqual((await appeler({ action: 'reinitialiser', confirmation: 'RESET' }, a.access_token)).statut, 403);
    assert.strictEqual((await appeler({ action: 'reinitialiser', confirmation: 'oui' }, m.access_token)).statut, 400); assert.strictEqual(t.suivi.length, n);
  });
  await groupe('confirmation d\'export et présence', async () => {
    const c = await connexion('chloe@exemple.fr'), m = await connexion('mika@exemple.fr');
    assert.strictEqual((await appeler({ action: 'export_confirmer' }, m.access_token)).statut, 403);
    const r = await appeler({ action: 'export_confirmer' }, c.access_token); assert.strictEqual(r.statut, 200); assert.strictEqual(t.meta.find((x) => x.cle === 'dernier_export').valeur, r.json.dernier_export);
    assert.strictEqual((await appeler({ action: 'presence', type: 'client', code: 'C00009' }, c.access_token)).statut, 200); assert.strictEqual((await appeler({ action: 'presence', type: 'client', code: 'C00009' }, m.access_token)).statut, 403);
  });
  await groupe('tickets : création, limites, visibilité par rôle, gestion', async () => {
    const c = await connexion('chloe@exemple.fr'), m = await connexion('mika@exemple.fr'), a = await connexion('quentin@exemple.fr');
    assert.strictEqual((await appeler({ action: 'ticket_creer', type: 'bidon', sujet: 'Sujet', message: 'Message' }, c.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'ticket_creer', type: 'probleme', sujet: 'x', message: 'Message' }, c.access_token)).statut, 400);
    const ok = await appeler({ action: 'ticket_creer', type: 'probleme', sujet: 'Bouton Export', message: 'Le téléchargement échoue.', page: 'export', contexte: { ecran: 'export' } }, c.access_token);
    assert.strictEqual(ok.statut, 200); const id = ok.json.id; assert.strictEqual(t.fificli_tickets.find((x) => x.id === id).auteur_email, 'chloe@exemple.fr');
    await appeler({ action: 'ticket_creer', type: 'question', sujet: 'Autre sujet', message: 'Question de test.' }, a.access_token);
    const siens = await appeler({ action: 'ticket_lister' }, c.access_token); assert.strictEqual(siens.json.tickets.length, 1); assert.strictEqual(siens.json.tous, false);
    const tous = await appeler({ action: 'ticket_lister' }, m.access_token); assert.strictEqual(tous.json.tickets.length, 2); assert.strictEqual(tous.json.tous, true);
    assert.strictEqual((await appeler({ action: 'ticket_maj', id, statut: 'traite', reponse: 'Corrigé.' }, c.access_token)).statut, 403);
    assert.strictEqual((await appeler({ action: 'ticket_maj', id, statut: 'inconnu' }, m.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'ticket_maj', id, statut: 'traite', reponse: 'Corrigé.' }, m.access_token)).statut, 200);
    const apres = await appeler({ action: 'ticket_lister' }, c.access_token); assert.strictEqual(apres.json.tickets[0].reponse, 'Corrigé.'); assert.strictEqual(apres.json.tickets[0].statut, 'traite');
    for (let i = 0; i < 12; i++) await appeler({ action: 'ticket_creer', type: 'question', sujet: 'Rafale ' + i, message: 'Test de limite.' }, c.access_token);
    assert.strictEqual((await appeler({ action: 'ticket_creer', type: 'question', sujet: 'Trop', message: 'Au-delà de 12 par heure.' }, c.access_token)).statut, 429);
  });
  await groupe('administration des données : import par morceaux et restauration (admin seulement)', async () => {
    const a = await connexion('quentin@exemple.fr'), c = await connexion('chloe@exemple.fr');
    assert.strictEqual((await appeler({ action: 'classeur_ajouter', cle: 'clients', colonnes: ['a'], lignes: [['1']], debut: true }, c.access_token)).statut, 403);
    assert.strictEqual((await appeler({ action: 'classeur_ajouter', cle: 'clients', colonnes: ['a'], lignes: [['1'], ['2']], debut: true }, a.access_token)).json.recues, 2);
    assert.strictEqual((await appeler({ action: 'classeur_ajouter', cle: 'clients', colonnes: ['a'], lignes: [['3']], debut: false }, a.access_token)).json.recues, 3);
    assert.strictEqual((await appeler({ action: 'classeur_publier', cle: 'clients', attendu: 3 }, a.access_token)).json.version, 4);
    assert.strictEqual((await appeler({ action: 'classeur_publier', cle: 'clients', attendu: 9 }, a.access_token)).statut, 502);
    const r = await appeler({ action: 'restaurer', type: 'client', lignes: [{ code: 'R1', traite_par: 'Chloé', champs: { statut: 'Fait ✅' } }, { code: '', champs: {} }] }, a.access_token); assert.strictEqual(r.json.restaurees, 1);
  });
  await groupe('mot de passe : longueur minimale et changement', async () => {
    const c = await connexion('chloe@exemple.fr');
    assert.strictEqual((await appeler({ action: 'password', password: 'court' }, c.access_token)).statut, 400);
    assert.strictEqual((await appeler({ action: 'password', password: 'un-mot-de-passe-long' }, c.access_token)).statut, 200); assert.strictEqual(comptes['chloe@exemple.fr'], 'un-mot-de-passe-long');
  });
  await groupe('actions inconnues et JSON invalide', async () => {
    const c = await connexion('chloe@exemple.fr'); assert.strictEqual((await appeler({ action: 'nimporte' }, c.access_token)).statut, 400);
    const r = await gestionnaire(new Request('https://f.test/x', { method: 'POST', body: '{pas du json' })); assert.strictEqual(r.status, 400);
  });

  console.log('\n' + (echecs ? 'ÉCHEC : ' + echecs + ' groupe(s) en défaut sur ' + (groupes + echecs) : 'Fonction Edge : ' + groupes + ' groupes de tests réussis, 0 en échec.'));
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
