/* Cockpit appels · données : classeur clients (avec cache local), suivi partagé, actualisation, enregistrements. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H;

  /* ------------------------------------------------------------------ cache du classeur (IndexedDB), vidé à la déconnexion */
  APP.cache = (function () {
    var NOM = 'hym-fificli', STORE = 'classeur', base = null;
    function ouvrir() {
      if (base) return base;
      base = new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('IndexedDB indisponible'));
        var r = indexedDB.open(NOM, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      base.catch(function () { base = null; });
      return base;
    }
    function tx(mode, f) { return ouvrir().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(STORE, mode), q = f(t.objectStore(STORE)); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }); }); }
    return {
      lire: function (cle) { return tx('readonly', function (s) { return s.get(cle); }).then(function (v) { return v || null; }, function () { return null; }); },
      ecrire: function (cle, val) { return tx('readwrite', function (s) { return s.put(val, cle); }).catch(function () {}); },
      vider: function () { return tx('readwrite', function (s) { return s.clear(); }).catch(function () {}); }
    };
  })();

  /* ------------------------------------------------------------------ état partagé */
  var D = APP.D = {
    pret: false, moi: null, membres: [], colCode: 'Code Client',
    clients: [], parCode: new Map(), base: [], baseParCode: new Map(),
    adresses: [], adrParCode: new Map(), adrParMere: new Map(), classeurNom: '', classeurDate: '',
    suivi: new Map(), suiviAdr: new Map(), verrous: [], compteurs: {}, dernierExport: '', derniereFiche: '',
    majLe: { suivi: '', adr: '' }, synchro: { etat: 'ok', le: null, message: '' }, absent: false
  };
  var enCours = null, derniereActu = 0;

  /* ----- personnes et couleurs ----- */
  D.traitants = function () { return D.membres.filter(function (m) { return m.role === 'commercial' || m.role === 'admin'; }).map(function (m) { return m.nom; }); };
  D.commerciales = function () { return D.membres.filter(function (m) { return m.role === 'commercial'; }).map(function (m) { return m.nom; }); };
  D.admins = function () { return D.membres.filter(function (m) { return m.role === 'admin'; }).map(function (m) { return m.nom; }); };
  D.couleur = function (nom) {
    var ordre = D.commerciales().sort().concat(D.admins().sort(), D.membres.filter(function (m) { return m.role === 'manager'; }).map(function (m) { return m.nom; }).sort());
    var i = ordre.indexOf(nom); return i < 0 ? 'var(--p3)' : 'var(--p' + (i % 4) + ')';
  };
  D.estRole = function () { var r = D.moi && D.moi.role, a = [].slice.call(arguments); return a.indexOf(r) >= 0; };
  D.peutTraiter = function () { return D.estRole('commercial', 'admin'); };
  D.peutPiloter = function () { return D.estRole('manager', 'admin'); };
  D.libelleRole = function (r) { return { commercial: 'Commerciale', manager: 'Manager', admin: 'Administrateur' }[r] || r; };
  D.prenom = function () { return D.moi ? D.moi.nom : ''; };

  /* ----- construction depuis la réponse du serveur ----- */
  function maxTs(a, b) { return b && b > a ? b : a; }
  function suivreMajLe(rows, cle) { rows.forEach(function (r) { D.majLe[cle] = maxTs(D.majLe[cle], r.maj_le || ''); }); }
  function construireClasseur(cl, ad) {
    D.absent = !cl;
    var t = cl || { colonnes: [], lignes: [] };
    D.colCode = H.trouverColonne(t.colonnes, ['code client', 'code_client']) || 'Code Client';
    D.clients = H.objetsDepuisTableau(t);
    D.parCode = new Map(); D.clients.forEach(function (c) { D.parCode.set(String(c[D.colCode]), c); });
    var ta = ad || { colonnes: [], lignes: [] };
    D.adresses = H.objetsDepuisTableau(ta);
    D.adrParCode = new Map(); D.adrParMere = new Map();
    D.adresses.forEach(function (a) { D.adrParCode.set(a['Code adresse'], a); var m = a['Code client mère']; (D.adrParMere.get(m) || D.adrParMere.set(m, []).get(m)).push(a); });
    D.classeurNom = (cl && cl.nom_fichier) || ''; D.classeurDate = (cl && cl.importe_le) || '';
  }
  function reconstruireBase() {
    D.base = D.clients.map(function (c) { return H.fusionnerClient(c, D.suivi.get(String(c[D.colCode])), D.colCode); });
    D.baseParCode = new Map(); D.base.forEach(function (b) { D.baseParCode.set(b._code, b); });
  }
  function appliquerCommun(c, partiel) {
    if (!partiel) { D.suivi = new Map(); D.suiviAdr = new Map(); D.majLe = { suivi: '', adr: '' }; }
    (c.suivi || []).forEach(function (r) { D.suivi.set(String(r.code_client), r); var f = D.baseParCode.get(String(r.code_client)); if (f) H.appliquerSuivi(f, r); });
    (c.suivi_adresses || []).forEach(function (r) { D.suiviAdr.set(String(r.code_adresse), r); });
    suivreMajLe(c.suivi || [], 'suivi'); suivreMajLe(c.suivi_adresses || [], 'adr');
    D.verrous = c.verrous || []; D.compteurs = c.compteurs || {};
    D.dernierExport = c.dernier_export || ''; D.derniereFiche = c.derniere_fiche || '';
  }

  /** Chargement initial (ou complet) : classeur (cache si à jour), membres, suivi, présence. */
  D.charger = function () {
    if (enCours) return enCours;
    enCours = Promise.all([APP.cache.lire('clients'), APP.cache.lire('adresses')]).then(function (c) {
      var vers = { clients: c[0] ? c[0].version : 0, adresses: c[1] ? c[1].version : 0 };
      return APP.nuage('bootstrap', { classeur: vers }, 90000).then(function (r) {
        var pris = function (x, cache, cle) {
          if (x.absent) return null;
          if (x.inchange) return cache;
          APP.cache.ecrire(cle, x); return x;
        };
        var cl = pris(r.classeur.clients, c[0], 'clients'), ad = pris(r.classeur.adresses, c[1], 'adresses');
        D.moi = r.moi; D.membres = r.membres || [];
        construireClasseur(cl, ad);
        appliquerCommun(r.commun, false);
        reconstruireBase();
        D.pret = true; D.synchro = { etat: 'ok', le: new Date(), message: '' }; derniereActu = Date.now();
        APP.emettre('synchro'); APP.emettre('donnees', { complet: true });
      });
    }).finally(function () { enCours = null; });
    return enCours;
  };

  /** Actualisation légère : uniquement ce qui a changé depuis le dernier chargement. */
  D.actualiser = function (opts) {
    opts = opts || {};
    if (!D.pret || enCours) return Promise.resolve(false);
    if (!opts.force && Date.now() - derniereActu < 4000) return Promise.resolve(false);
    var recul = function (ts) { if (!ts) return ''; var d = new Date(ts + 'Z'); return isNaN(d) ? '' : new Date(d.getTime() - 4000).toISOString().slice(0, 19); };
    enCours = APP.nuage('delta', { since: recul(D.majLe.suivi), since_adr: recul(D.majLe.adr) }, 40000).then(function (r) {
      var avant = JSON.stringify([D.verrous, D.compteurs, D.dernierExport]);
      appliquerCommun(r.commun, true);
      derniereActu = Date.now();
      D.synchro = { etat: 'ok', le: new Date(), message: '' }; APP.emettre('synchro');
      var diff = (r.commun.suivi || []).length + (r.commun.suivi_adresses || []).length > 0 || avant !== JSON.stringify([D.verrous, D.compteurs, D.dernierExport]);
      if (r.n_suivi >= 0 && r.n_suivi !== D.suivi.size) { enCours = null; return D.charger().then(function () { return true; }); }   // lignes supprimées (réinitialisation) : rechargement complet
      if (diff) APP.emettre('donnees', { complet: false });
      return diff;
    }, function (e) {
      D.synchro = { etat: e.code === 'session' ? 'session' : 'erreur', le: D.synchro.le, message: e.message }; APP.emettre('synchro');
      if (e.code === 'session' && !opts.silencieux) APP.porte.ouvrir().then(function () { APP.porte.fermer(); return D.actualiser({ force: true }); });
      return false;
    }).finally(function () { enCours = null; });
    return enCours;
  };
  var planifiee = null;
  D.actualiserBientot = function (ms) { clearTimeout(planifiee); planifiee = setTimeout(function () { D.actualiser({ force: true, silencieux: true }); }, ms || 1200); };

  /* ----- boucle de synchronisation ----- */
  D.demarrerSynchro = function () {
    setInterval(function () { if (document.visibilityState === 'visible') D.actualiser({ silencieux: true }); }, 25000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') D.actualiser({ silencieux: true }); });
    window.addEventListener('online', function () { D.actualiser({ force: true, silencieux: true }); });
    window.addEventListener('offline', function () { D.synchro = { etat: 'hors', le: D.synchro.le, message: 'Hors connexion' }; APP.emettre('synchro'); });
  };

  /* ----- enregistrements ----- */
  function integrer(r, adresse) {
    if (adresse) { D.suiviAdr.set(String(r.code_adresse), r); suivreMajLe([r], 'adr'); }
    else { D.suivi.set(String(r.code_client), r); var f = D.baseParCode.get(String(r.code_client)); if (f) H.appliquerSuivi(f, r); suivreMajLe([r], 'suivi'); }
  }
  D.enregistrerFiche = function (code, champs, effacements) {
    return APP.nuageSur('fiche_enregistrer', { code: code, champs: champs, effacements: effacements || [] }).then(function (r) {
      integrer(r.fiche, false); D.actualiserBientot(); APP.emettre('donnees', { code: code, local: true }); return r.fiche;
    });
  };
  D.enregistrerAdresse = function (code, champs, effacements) {
    return APP.nuageSur('adresse_enregistrer', { code: code, champs: champs, effacements: effacements || [] }).then(function (r) {
      integrer(r.fiche, true); D.actualiserBientot(); APP.emettre('donnees', { code: code, local: true }); return r.fiche;
    });
  };
  D.reattribuer = function (code, traitant, statut) {
    return APP.nuageSur('reattribuer', { code: code, traitant: traitant, statut: statut }).then(function (r) {
      integrer(r.fiche, false); D.actualiserBientot(); APP.emettre('donnees', { code: code, local: true }); return r.fiche;
    });
  };
  D.confirmerExport = function () {
    return APP.nuageSur('export_confirmer', {}).then(function (r) { D.dernierExport = r.dernier_export; APP.emettre('donnees', { local: true }); });
  };

  /* ----- présence : qui regarde quelle fiche ----- */
  var dernierePresence = {};
  D.presence = function (type, code) {
    var cle = type + ':' + code, t = dernierePresence.cle === cle ? dernierePresence.t : 0;
    if (Date.now() - t < 60000) return;
    dernierePresence = { cle: cle, t: Date.now() };
    APP.nuage('presence', { type: type, code: code }, 15000).catch(function () { dernierePresence = {}; });
  };
  D.autresSur = function (type, code) {
    var maintenant = Date.now(), res = [];
    D.verrous.forEach(function (v) {
      if (v.type_fiche !== type || String(v.code) !== String(code)) return;
      var d = new Date(String(v.depuis).replace(' ', 'T') + 'Z'), min = Math.floor((maintenant - d.getTime()) / 60000);
      if (isNaN(min) || min > H.VERROU_MINUTES) return;
      res.push({ nom: v.utilisateur, minutes: Math.max(0, min) });
    });
    return res;
  };
  D.codesOuverts = function (type) {
    var maintenant = Date.now(), s = new Set();
    D.verrous.forEach(function (v) { if (v.type_fiche !== type) return; var d = new Date(String(v.depuis).replace(' ', 'T') + 'Z'); if (!isNaN(d) && (maintenant - d.getTime()) / 60000 <= H.VERROU_MINUTES) s.add(String(v.code)); });
    return s;
  };

  /* ----- indicateurs communs ----- */
  D.suiviListe = function () { return Array.from(D.suivi.values()); };
  D.suiviAdrListe = function () { return Array.from(D.suiviAdr.values()); };
  D.avancement = function () {
    var total = D.base.length, faits = 0, rappeler = 0, doublons = 0, nonAttribuees = 0;
    D.base.forEach(function (b) { if (H.estTermine(b.statut)) faits++; if (b.statut === 'À rappeler') rappeler++; if (b.statut === 'Doublon') doublons++; if (!H.texte(b.traite_par).trim()) nonAttribuees++; });
    return { total: total, faits: faits, restants: total - faits, rappeler: rappeler, doublons: doublons, nonAttribuees: nonAttribuees };
  };
  D.rythmeEquipe = function () { return H.calculerRythme(D.suiviListe()); };
  D.statsDe = function (nom) { return H.statsUtilisateur(D.suiviListe(), D.suiviAdrListe(), nom, D.compteurs); };
  D.rappelsDus = function (nom) { return H.rappelsDus(D.base, nom, H.aujourdhui()); };
  D.rappelsPlanifies = function (nom) { return H.rappelsPlanifies(D.base, nom); };
  D.nbModifs = function () {
    var ref = D.dernierExport || '1970-01-01T00:00:00', n = 0;
    D.suivi.forEach(function (s) { if ((s.maj_le || '') > ref) n++; });
    D.suiviAdr.forEach(function (s) { if ((s.maj_le || '') > ref) n++; });
    return n;
  };
  D.rapport = function (jours) { return APP.nuage('rapport', { jours: jours }, 40000); };
})();
