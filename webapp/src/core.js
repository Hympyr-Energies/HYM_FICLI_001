/* Cockpit appels · noyau : outils, icônes, notifications, fenêtres, thème, accès (session de membre), navigation, aimant des boutons. */
(function () {
  'use strict';
  var APP = window.APP = window.APP || {};
  var H = window.HYM, CFG = window.HYM_CONFIG || {};
  APP.H = H;
  APP.VERSION = '1.0.0';

  /* ------------------------------------------------------------------ outils */
  var $ = APP.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = APP.$$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = APP.esc = function (t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  APP.reduit = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches; };
  APP.attendre = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  APP.debounce = function (f, ms) { var h; return function () { var a = arguments, c = this; clearTimeout(h); h = setTimeout(function () { f.apply(c, a); }, ms); }; };
  APP.pref = function (k, v) {
    var cle = 'hym.pref.' + k;
    try { if (v === undefined) return JSON.parse(localStorage.getItem(cle) || 'null'); if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { return null; }
    return undefined;
  };
  /** Préférence propre à la personne connectée. */
  APP.prefMoi = function (k, v) { var u = APP.session.lire(); return APP.pref((u ? u.email : '?') + '.' + k, v); };
  APP.fmt = {
    entier: function (n) { return H.formaterEntier(n); },
    pct: function (n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) + ' %'; },
    jour: function (iso) { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); },
    jourCourt: function (iso) { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''); },
    heure: function (d) { return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  };

  /* ------------------------------------------------------------------ pictogrammes (traits, aucun emoji) */
  var TRACES = {
    synthese: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    phone: '<path d="M5.5 4h3l1.6 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.6v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4z"/>',
    truck: '<path d="M2 6.5h11v9.5H2zM13 9.5h4.5l3.5 3.5V16H13z"/><circle cx="7" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    chart: '<path d="M4 19.5h16M7 16v-5M12 16V6.5M17 16v-8"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 19.5h15"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    logout: '<path d="M9.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9.5"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5M16 5.8a3.2 3.2 0 0 1 0 5.4M18.5 14.8c1.6.7 2.6 2.2 3 4.7"/>',
    loupe: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    filtre: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
    gauche: '<path d="M14.5 6l-6 6 6 6"/>', droite: '<path d="M9.5 6l6 6-6 6"/>', bas: '<path d="M6 9.5l6 6 6-6"/>', haut: '<path d="M6 14.5l6-6 6 6"/>',
    check: '<circle cx="12" cy="12" r="9.5"/><path d="M7.8 12.4l2.8 2.8 5.6-6"/>',
    coche: '<path d="M5.5 12.5l4.2 4.2 8.8-9.4"/>',
    alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.01"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.4"/><path d="M4 7l8 6 8-6"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    building: '<rect x="5" y="3.5" width="9" height="17" rx="1.6"/><path d="M14 9h4.5a1 1 0 0 1 1 1v10.5H14M8.5 8h2M8.5 11.5h2M8.5 15h2"/>',
    ticket: '<path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V17h-2A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8 10h8M8 13h5"/>',
    send: '<path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-3.5-6.5L4 10.5z"/>',
    croix: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', moins: '<path d="M5 12h14"/>',
    trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5"/>',
    fichier: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5"/>',
    script: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5M8.5 12h7M8.5 15.5h7"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
    shield: '<path d="M12 3.5l7 2.8v5.4c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
    cible: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    flux: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    base: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v6c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V6M4.5 12v6c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-6"/>',
    bulle: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7L8 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/>'
  };
  APP.icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (TRACES[n] || '') + '</svg>'; };

  /* ------------------------------------------------------------------ évènements internes */
  var abonnes = {};
  APP.sur = function (evt, f) { (abonnes[evt] = abonnes[evt] || []).push(f); };
  APP.emettre = function (evt, arg) { (abonnes[evt] || []).forEach(function (f) { try { f(arg); } catch (e) { console.error(e); } }); };

  /* ------------------------------------------------------------------ notifications */
  APP.toast = function (texte, type) {
    var zone = $('#toasts'); if (!zone) return;
    var t = document.createElement('div');
    t.className = 'toast verre toast--' + (type || 'ok'); t.setAttribute('role', type === 'err' ? 'alert' : 'status');
    t.innerHTML = APP.icon(type === 'err' ? 'alert' : 'check') + '<span>' + esc(texte) + '</span>';
    zone.appendChild(t);
    setTimeout(function () { t.classList.add('sort'); setTimeout(function () { t.remove(); }, 350); }, type === 'err' ? 7000 : 3800);
  };

  /* ------------------------------------------------------------------ fenêtres */
  APP.fenetre = function (html, opts) {
    opts = opts || {};
    var d = document.createElement('dialog');
    d.className = opts.classe || ''; d.innerHTML = html;
    document.body.appendChild(d);
    var ferme = false;
    var fin = function () {
      if (ferme || !d.open) return; ferme = true;
      if (APP.reduit()) { d.close(); return; }
      d.classList.add('sort'); setTimeout(function () { d.close(); }, 220);
    };
    d.addEventListener('close', function () { setTimeout(function () { d.remove(); }, 20); if (opts.onClose) opts.onClose(); });
    d.addEventListener('cancel', function (e) { e.preventDefault(); fin(); });
    d.addEventListener('click', function (e) { if (e.target === d) fin(); });
    d.showModal();
    return { el: d, fermer: fin };
  };
  /** Confirmation : résout true / false. */
  APP.confirmer = function (o) {
    return new Promise(function (resolve) {
      var rep = false;
      var f = APP.fenetre('<div class="modale verre"><h2>' + esc(o.titre) + '</h2><div class="aide">' + (o.html || esc(o.texte || '')) + '</div>' +
        '<div class="actions"><button class="btn ' + (o.danger ? 'btn--danger' : 'btn--main') + '" data-ok>' + esc(o.ok || 'Confirmer') + '</button><button class="btn btn--ghost" data-non>' + esc(o.non || 'Annuler') + '</button></div></div>',
        { onClose: function () { resolve(rep); } });
      $('[data-ok]', f.el).addEventListener('click', function () { rep = true; f.fermer(); });
      $('[data-non]', f.el).addEventListener('click', function () { f.fermer(); });
    });
  };
  APP.occupe = function (btn, texte) { btn.disabled = true; btn.dataset.txt = btn.innerHTML; btn.innerHTML = '<span class="chargement" aria-hidden="true"></span>' + esc(texte); };
  APP.libere = function (btn) { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; };
  APP.message = function (type, texte) { return '<div class="msg msg--' + type + '">' + APP.icon(type === 'ok' ? 'check' : type === 'info' ? 'info' : 'alert') + '<div>' + texte + '</div></div>'; };

  /* ------------------------------------------------------------------ thème clair / sombre */
  APP.theme = {
    courant: function () { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; },
    appliquer: function (t, memoriser) {
      document.documentElement.setAttribute('data-theme', t);
      if (memoriser) { try { localStorage.setItem('hym.theme', t); } catch (e) {} }
      var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#073D27' : '#D5E7DC');
      var b = $('#btn-theme');
      if (b) { b.innerHTML = APP.icon(t === 'dark' ? 'sun' : 'moon'); b.setAttribute('aria-label', t === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'); b.title = b.getAttribute('aria-label'); }
      APP.emettre('theme', t);
    },
    basculer: function () {
      var racine = document.documentElement, suivant = APP.theme.courant() === 'dark' ? 'light' : 'dark';
      if (APP.reduit()) { APP.theme.appliquer(suivant, true); return; }
      racine.classList.add('bascule');                       // fondu doux de toutes les couleurs, retiré aussitôt après
      APP.theme.appliquer(suivant, true);
      setTimeout(function () { racine.classList.remove('bascule'); }, 520);
    }
  };

  /* ------------------------------------------------------------------ réseau (injectable pour les tests) */
  APP.reseau = {
    json: function (url, opts) {
      opts = opts || {};
      var ac = new AbortController(), id = setTimeout(function () { ac.abort(); }, opts.timeout || 8000);
      return fetch(url, { signal: ac.signal, method: opts.method || 'GET', headers: opts.headers, body: opts.body })
        .then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; e.corps = r; throw e; } return r.json(); })
        .finally(function () { clearTimeout(id); });
    }
  };

  /* ------------------------------------------------------------------ fonction serveur (qui détient les clés Supabase : la page n'en contient aucune) */
  function erreurDe(e, corps) {
    var err = new Error(corps && corps.message ? corps.message : 'Service injoignable.');
    var st = e && e.status;
    if (st === 401) err.code = 'auth';
    else if (st === 403) err.code = (corps && corps.code) || 'membre';
    else if (st === 400) err.code = 'requete';
    else if (st === 429) err.code = 'limite';
    else if (st) { err.code = 'base'; if (!corps || !corps.message) err.message = 'Échec du service (HTTP ' + st + ').'; }
    else { err.code = 'reseau'; err.message = 'Service injoignable : vérifiez la connexion.'; }
    return err;
  }
  function appeler(action, corps, jeton, delai) {
    var headers = { 'Content-Type': 'application/json' };
    if (jeton) headers.Authorization = 'Bearer ' + jeton;
    return APP.reseau.json(CFG.API_URL, { method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, corps || {})), timeout: delai || 25000 }).catch(function (e) {
      if (e && e.corps && e.corps.json) return e.corps.json().catch(function () { return null; }).then(function (b) { throw erreurDe(e, b); });
      throw erreurDe(e, null);
    });
  }
  APP.appelerFonction = appeler;

  /* ------------------------------------------------------------------ session commune des outils Hympyr (connexion unique par le portail) */
  // Même client supabase-js, même origine (hympyr-energies.github.io) et même clé de stockage que le portail, la charte et le pilotage :
  // une connexion au portail ouvre ce cockpit, « Se déconnecter » ici ferme tous les outils. La clé « publishable » est publique par
  // conception ; les données restent derrière la fonction Edge, qui valide le jeton et vérifie l'appartenance à la table de membres.
  var PORTAIL = CFG.PORTAIL_URL || 'https://hympyr-energies.github.io/portail/', SB = null, courante = null;
  try {
    if (window.supabase && CFG.SB_URL && CFG.SB_KEY) SB = window.supabase.createClient(CFG.SB_URL, CFG.SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  } catch (e) { SB = null; }
  function sansSession(message) { var e = new Error(message || 'Connexion requise.'); e.code = 'session'; return e; }
  function retenir(s) { courante = s && s.access_token ? s : null; return courante; }
  function sessionDe(r) { return retenir(r && r.data ? r.data.session : null); }
  if (SB) SB.auth.onAuthStateChange(function (ev, s) {
    retenir(s);
    // Déconnexion depuis le portail, un autre outil ou un autre onglet : on masque aussitôt les données de l'écran.
    if (ev === 'SIGNED_OUT' && APP.porte && APP.porte.demarre) APP.porte.ouvrir().then(APP.porte.fermer);
  });

  APP.portail = {
    url: function (params) {
      var u = new URL(PORTAIL);
      Object.keys(params || {}).forEach(function (k) { if (params[k]) u.searchParams.set(k, params[k]); });
      return u.href;
    },
    /** Pas de session : direction la page de connexion unique, qui ramène ici ensuite (?retour=…).
        Garde-fou : si l'on revient du portail sans session depuis moins de 20 s, on s'arrête (évite une boucle de redirections). */
    seConnecter: function () {
      var dernier = 0, k = 'hym.redirection.' + (CFG.OUTIL || 'outil');
      try { dernier = +sessionStorage.getItem(k) || 0; sessionStorage.setItem(k, String(Date.now())); } catch (e) {}
      if (Date.now() - dernier < 20000) return false;
      location.replace(APP.portail.url({ retour: location.href, outil: CFG.OUTIL }));
      return true;
    },
    /** Compte connecté mais pas membre de ce cockpit : retour au portail, qui l'explique (sans fermer la session des autres outils). */
    refuser: function () { location.replace(APP.portail.url({ outil: CFG.OUTIL, refus: '1' })); },
    /** Ancien lien « mot de passe oublié » arrivé sur le cockpit : la saisie du nouveau mot de passe se fait au portail. */
    recuperation: function () {
      var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
      location.replace(PORTAIL + location.hash);
      return true;
    }
  };

  APP.session = {
    disponible: function () { return !!SB; },
    /** Lit la session commune (stockage partagé avec le portail) ; null si personne n'est connecté. */
    demarrer: function () {
      if (!SB) return Promise.reject(new Error('Service de connexion indisponible : vérifiez la connexion internet puis rechargez la page.'));
      return SB.auth.getSession().then(sessionDe);
    },
    lire: function () { return courante && courante.user ? { email: courante.user.email, nom: '' } : null; },
    utilisateur: function () { return APP.session.lire(); },
    active: function () { return !!courante; },
    /** Jeton valide : supabase-js le renouvelle automatiquement (un seul renouvellement à la fois entre onglets). */
    jeton: function () {
      if (!SB) return Promise.reject(sansSession());
      return SB.auth.getSession().then(function (r) { var s = sessionDe(r); if (!s) throw sansSession(); return s.access_token; });
    },
    rafraichir: function () {
      if (!SB) return Promise.reject(sansSession());
      return SB.auth.refreshSession().then(function (r) { var s = sessionDe(r); if ((r && r.error) || !s) throw sansSession('Session expirée : reconnectez-vous.'); return s; });
    },
    /** La session commune n'est jamais effacée sur une simple erreur : seul « Se déconnecter » la ferme (pour tous les outils). */
    effacer: function () {},
    fermer: function () { return SB ? SB.auth.signOut().then(function () {}, function () {}) : Promise.resolve(); },
    changerMotDePasse: function (mdp) { return APP.nuage('password', { password: mdp }); }
  };
  /** Appel authentifié : une session refusée est renouvelée une fois avant d'abandonner. */
  APP.nuage = function (action, corps, delai) {
    var essai = function (reprise) {
      return APP.session.jeton().then(function (j) { return appeler(action, corps, j, delai); }).catch(function (e) {
        if (e.code === 'auth' && !reprise) return APP.session.rafraichir().then(function () { return essai(true); });
        if (e.code === 'auth') { e.code = 'session'; e.message = 'Session expirée : reconnectez-vous.'; }
        throw e;
      });
    };
    return essai(false);
  };
  /** Appel authentifié avec reconnexion en fenêtre si la session a expiré (la saisie en cours n'est jamais perdue). */
  APP.nuageSur = function (action, corps, delai) {
    return APP.nuage(action, corps, delai).catch(function (e) {
      if (e.code !== 'session') throw e;
      return APP.porte.ouvrir().then(function () { APP.porte.fermer(); return APP.nuage(action, corps, delai); });
    });
  };
  /** Déconnexion : ferme la session commune (tous les outils Hympyr), vide le cache du classeur, retour à la page de connexion unique. */
  APP.verrouiller = function () {
    var portail = function () { location.replace(APP.portail.url()); };
    APP.session.fermer().then(function () { return APP.cache ? APP.cache.vider() : null; }).then(portail, portail);
  };

  /* ------------------------------------------------------------------ navigation : onglets selon le rôle, pastille qui glisse, transition sans saccade */
  var DEFINITION = {
    synthese: { libelle: 'Synthèse', icone: 'synthese' }, appels: { libelle: 'Appels', icone: 'phone' }, livraisons: { libelle: 'Livraisons', icone: 'truck' },
    rappels: { libelle: 'Rappels', icone: 'calendar' }, export: { libelle: 'Export', icone: 'download' }, pilotage: { libelle: 'Pilotage', icone: 'chart' }
  };
  var PAR_ROLE = {
    commercial: ['synthese', 'appels', 'livraisons', 'rappels', 'export'],
    admin: ['synthese', 'appels', 'livraisons', 'rappels', 'pilotage'],
    manager: ['synthese', 'rappels', 'pilotage']
  };
  APP.ongletsDuRole = function (role) { return PAR_ROLE[role] || PAR_ROLE.commercial; };
  var courant = null, ordre = [];
  function placerPilule(conteneur) {
    var pil = $('.pilule', conteneur), on = $('.tab[aria-selected="true"]', conteneur);
    if (!pil || !on || !on.offsetWidth) return;
    pil.style.width = on.offsetWidth + 'px';
    pil.style.height = on.offsetHeight + 'px';
    pil.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
  }
  APP.placerPilules = function () { $$('.tabs, .basse').forEach(placerPilule); };
  APP.construireOnglets = function (role) {
    ordre = APP.ongletsDuRole(role);
    ['#tabs', '#basse'].forEach(function (sel) {
      var c = $(sel); $$('.tab', c).forEach(function (t) { t.remove(); });
      ordre.forEach(function (n) {
        var b = document.createElement('button');
        b.className = 'tab'; b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.onglet = n; b.setAttribute('aria-controls', 'p-' + n); b.setAttribute('aria-selected', 'false');
        b.innerHTML = APP.icon(DEFINITION[n].icone) + '<span>' + DEFINITION[n].libelle + '</span>';
        c.appendChild(b);
      });
    });
  };
  APP.ongletCourant = function () { return courant; };
  APP.aller = function (nom, opts) {
    opts = opts || {};
    if (ordre.indexOf(nom) < 0) nom = ordre[0];
    var vieux = courant && $('#p-' + courant), neuf = $('#p-' + nom);
    $$('.tab').forEach(function (t) { var on = t.dataset.onglet === nom; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    APP.placerPilules();
    if (courant === nom) { if (opts.ouvrir && APP.vues[nom] && APP.vues[nom].ouvrir) APP.vues[nom].ouvrir(opts); return; }
    var precedent = courant; courant = nom;
    try { history.replaceState(null, '', '#' + nom); } catch (e) {}
    APP.prefMoi('onglet', nom);
    var montrer = function () {
      $$('.panneau').forEach(function (p) { p.classList.remove('is-on', 'entre', 'sort'); });
      neuf.classList.add('is-on');
      var v = APP.vues[nom];
      if (v) { if (!v.pret) { v.pret = true; if (v.rendre) v.rendre(); } else if (v.sale && v.rendre) { v.sale = false; v.rendre(); } if (v.ouvrir) v.ouvrir(opts); }
      if (!APP.reduit() && !opts.sans) { neuf.classList.add('entre'); setTimeout(function () { neuf.classList.remove('entre'); }, 560); }
      if (!opts.sans) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      APP.emettre('onglet', nom);
    };
    if (vieux && precedent && !APP.reduit() && !opts.sans) { vieux.classList.add('sort'); setTimeout(montrer, 160); } else montrer();
  };
  /** Marque les écrans à reconstruire ; reconstruit tout de suite celui qui est affiché. */
  APP.invalider = function (sauf) {
    Object.keys(APP.vues).forEach(function (k) { if (k === sauf) return; var v = APP.vues[k]; if (!v.pret) return; if (k === courant) { if (v.actualiser) v.actualiser(); else if (v.rendre) v.rendre(); } else v.sale = true; });
  };
  APP.vues = {};

  /* ------------------------------------------------------------------ aimant des boutons : même effet que le site (5 % / ±4 px, 12 % / ±3 px) */
  (function () {
    var calme = APP.reduit(), tactile = window.matchMedia && matchMedia('(hover:none)').matches;
    if (calme || tactile || !('WeakMap' in window)) return;
    var CIBLES = '.btn,.rond,.icone-btn,.tab,.fab,.puce,.util', EXCL = '[disabled],[aria-disabled="true"]';
    var etat = new WeakMap(), actifs = [], raf = 0, avant = 0;
    var borne = function (v, m) { return Math.max(-m, Math.min(m, v)); };
    function suivi(el) { var s = etat.get(el); if (!s) { s = { x: 0, y: 0, cx: 0, cy: 0 }; etat.set(el, s); } return s; }
    function boucle(t) {
      raf = 0; var dt = Math.min(64, t - (avant || t)); avant = t; var a = 1 - Math.exp(-dt / 55), vw = document.documentElement.clientWidth / 100 || 1;
      for (var i = actifs.length - 1; i >= 0; i--) {
        var el = actifs[i], s = etat.get(el);
        s.x += (s.cx - s.x) * a; s.y += (s.cy - s.y) * a;
        if (Math.abs(s.cx - s.x) < .02 && Math.abs(s.cy - s.y) < .02) { s.x = s.cx; s.y = s.cy; if (!s.cx && !s.cy) { el.style.removeProperty('translate'); s.on = false; actifs.splice(i, 1); continue; } }
        el.style.translate = (s.x / vw).toFixed(3) + 'vw ' + (s.y / vw).toFixed(3) + 'vw';
      }
      if (actifs.length) raf = requestAnimationFrame(boucle); else avant = 0;
    }
    function lance(el, s) { if (!s.on) { s.on = true; actifs.push(el); } if (!raf) raf = requestAnimationFrame(boucle); }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return; var el = e.target.closest && e.target.closest(CIBLES); if (!el || el.matches(EXCL)) return;
      var s = suivi(el), r = el.getBoundingClientRect();
      s.cx = borne((e.clientX - (r.left + r.width / 2)) * .05, 4); s.cy = borne((e.clientY - (r.top + r.height / 2)) * .12, 3); lance(el, s);
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var el = e.target.closest && e.target.closest(CIBLES), s = el && etat.get(el);
      if (!s || (e.relatedTarget && el.contains(e.relatedTarget))) return; s.cx = 0; s.cy = 0; lance(el, s);
    }, true);
  })();

  /* ------------------------------------------------------------------ animations légères */
  APP.compter = function (el, vers, fmt) {
    fmt = fmt || APP.fmt.entier;
    var de = parseFloat(el.dataset.v || '0') || 0; el.dataset.v = vers;
    var id = el._cpt = (el._cpt || 0) + 1;
    if (APP.reduit() || de === vers) { el.textContent = fmt(vers); return; }
    var t0 = null;
    (function pas(t) { if (el._cpt !== id) return; t0 = t0 || t; var p = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(de + (vers - de) * e); if (p < 1) requestAnimationFrame(pas); else el.textContent = fmt(vers); })(performance.now());
  };
  /** Pastille qui glisse derrière le bouton actif d'un groupe .seg. */
  APP.glisse = function (seg) {
    var p = $('.glisse', seg); if (!p) { p = document.createElement('span'); p.className = 'glisse'; p.setAttribute('aria-hidden', 'true'); seg.insertBefore(p, seg.firstChild); }
    var on = $('button[aria-pressed="true"]', seg); if (!on || !on.offsetWidth) { p.style.opacity = 0; return; }
    p.style.opacity = 1; p.style.width = on.offsetWidth + 'px'; p.style.height = on.offsetHeight + 'px'; p.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
  };
  /** Groupe de boutons exclusifs : applique la sélection et notifie. */
  APP.segment = function (seg, valeur, onChange) {
    $$('button', seg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === valeur)); });
    APP.glisse(seg);
    if (!seg._lie) {
      seg._lie = true;
      seg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || !seg.contains(b)) return; $$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); APP.glisse(seg); if (onChange) onChange(b.dataset.v); });
    }
  };
  /** Place les pastilles glissantes de tous les groupes visibles. */
  APP.placerSegments = function () { $$('.seg').forEach(function (s) { if (s.offsetWidth) APP.glisse(s); }); };
  APP.tel = function (t) { var n = String(t || '').replace(/[^\d+]/g, ''); return n; };
  APP.telecharger = function (blob, nom) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  /** Scripts chargés à la demande (bibliothèques d'export) — séquentiellement : autotable dépend de jsPDF, exceljs est autonome. */
  APP.charger = function (url) {
    APP._scripts = APP._scripts || {};
    return APP._scripts[url] || (APP._scripts[url] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = function () { delete APP._scripts[url]; rej(new Error('Bibliothèque non chargée : ' + url)); }; document.head.appendChild(s); }));
  };
})();
