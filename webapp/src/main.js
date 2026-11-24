/* Cockpit appels · démarrage : connexion des membres, en-tête, compte, visite guidée, navigation. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon;

  /* ------------------------------------------------------------------ état de synchronisation (puce de l'en-tête) */
  function puce() {
    var p = $('#puce'); if (!p) return;
    var s = D.synchro, cls = 'puce', txt;
    if (s.etat === 'erreur') { cls += ' is-err'; txt = 'Connexion instable'; }
    else if (s.etat === 'hors') { cls += ' is-err'; txt = 'Hors connexion'; }
    else if (s.etat === 'session') { cls += ' is-err'; txt = 'Reconnexion requise'; }
    else if (s.etat === 'charge') { cls += ' is-dirty'; txt = 'Actualisation'; }
    else txt = s.le ? 'À jour · ' + APP.fmt.heure(s.le) : 'À jour';
    p.className = cls;
    p.innerHTML = '<i></i><span class="txt">' + esc(txt) + '</span>';
    p.title = (s.message ? s.message + '. ' : '') + 'Cliquez pour actualiser les données de l\'équipe.';
  }
  APP.sur('synchro', puce);

  /* ------------------------------------------------------------------ accès : session commune ouverte au portail Hympyr */
  APP.porte = (function () {
    var attente = null, termine = null, liees = false;
    var formulaires = ['f-session', 'f-charge'];
    function montrer(nom) {
      formulaires.forEach(function (id) { $('#' + id).hidden = id !== nom; });
      $$('.porte-erreur').forEach(function (e) { e.textContent = ''; });
    }
    /** Reprise sans recharger la page (saisies conservées) dès qu'une session est rouverte au portail, dans un autre onglet. */
    function reprendre(manuel) {
      if (!termine) return;
      APP.session.jeton().then(function () { if (termine) termine(); }, function () {
        if (manuel) $('#f-session .porte-erreur').textContent = 'Toujours aucune session : connectez-vous d\'abord sur le portail.';
      });
    }
    function lier() {
      $('#s-portail').href = APP.portail.url();
      $('#s-reprendre').onclick = function () { reprendre(true); };
      window.addEventListener('focus', function () { reprendre(false); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reprendre(false); });
    }
    function afficher() { if (!liees) { lier(); liees = true; } var porte = $('#porte'); porte.hidden = false; porte.classList.remove('sort'); }
    return {
      demarre: false,
      /** Session fermée en cours de travail : panneau « Session fermée » ; résout quand une session est de nouveau disponible. */
      ouvrir: function () {
        if (attente) return attente;
        afficher(); montrer('f-session');
        attente = new Promise(function (res) { termine = res; }).then(function () { attente = null; termine = null; });
        return attente;
      },
      /** Panneau « chargement des données » (avec nouvel essai si la base est injoignable). */
      charge: function (fn) {
        afficher();
        var essai = function () {
          montrer('f-charge'); $('#ch-etat').hidden = false; $('#ch-err').textContent = ''; $('#ch-retour').hidden = true;
          return fn().then(function () { return true; }, function (e) {
            if (e.code === 'session') return APP.porte.ouvrir().then(essai);
            if (e.code === 'membre') { APP.portail.refuser(); return new Promise(function () {}); }
            $('#ch-etat').hidden = true; $('#ch-err').textContent = 'Chargement impossible : ' + e.message; $('#ch-retour').hidden = false;
            return new Promise(function (r) { $('#ch-retour').onclick = function () { r(essai()); }; });
          });
        };
        return essai();
      },
      /** Erreur bloquante au démarrage (service de connexion injoignable, boucle de redirection évitée). */
      erreur: function (message) {
        afficher(); montrer('f-charge'); $('#ch-etat').hidden = true; $('#ch-err').textContent = message;
        $('#ch-retour').hidden = false; $('#ch-retour').onclick = function () { location.reload(); };
      },
      fermer: function () { var p = $('#porte'); p.classList.add('sort'); setTimeout(function () { p.hidden = true; }, 600); }
    };
  })();

  /** Démarrage : session commune présente -> chargement ; absente -> page de connexion unique (portail), qui ramène ici. */
  function connexion(charger) {
    var jamais = new Promise(function () {});
    if (APP.portail.recuperation()) return jamais;
    return APP.session.demarrer().then(function (s) {
      if (!s) {
        if (!APP.portail.seConnecter()) APP.porte.erreur('La connexion du portail n\'a pas été retrouvée sur cette page. Rechargez la page ou reconnectez-vous depuis le portail.');
        return jamais;
      }
      return APP.porte.charge(charger).then(function () { APP.porte.demarre = true; APP.porte.fermer(); });
    }, function (e) { APP.porte.erreur(e.message); return jamais; });
  }

  /* ------------------------------------------------------------------ visite guidée (reformulée, courte) */
  var VISITE = {
    commercial: [
      ['Synthèse', 'L\'écran d\'accueil rassemble vos chiffres du jour, les rappels à passer, l\'avancement de l\'équipe et l\'objectif du 1er septembre 2027.'],
      ['Appels', 'Une fiche à la fois. Le filtre « Non traité » vous évite d\'appeler un client déjà pris par une collègue. Un bandeau signale quand quelqu\'un consulte la même fiche que vous.'],
      ['Script d\'appel', 'Le bouton Script ouvre le déroulé de l\'appel et les réponses aux objections. Le type de client est déduit de la fiche et reste modifiable. La recherche ouvre directement la bonne objection.'],
      ['Enregistrer', 'Renseignez le résultat de l\'appel puis enregistrez : la fiche suivante s\'ouvre (Ctrl + Entrée au clavier). Un champ laissé vide ne remplace jamais une information déjà saisie.'],
      ['Livraisons et rappels', 'Pour chaque site livré, notez le référent sur place. Le calendrier des rappels regroupe vos clients à recontacter, par jour.'],
      ['Besoin d\'aide', 'Le bouton Ticket, en bas à droite, transmet un problème ou une suggestion à l\'administrateur avec l\'écran concerné.']
    ],
    manager: [
      ['Synthèse', 'Avancement global de la campagne, rythme observé, fin estimée et objectif quotidien pour tenir l\'échéance du 1er septembre 2027.'],
      ['Rappels', 'Le calendrier montre la charge à venir de l\'équipe, jour par jour, et les rappels en retard.'],
      ['Pilotage', 'Objectif, performance de chaque commerciale, reporting journalier des appels et journal des interventions. Votre profil est en lecture seule, sauf la réinitialisation, qui vous est réservée.'],
      ['Besoin d\'aide', 'Le bouton Ticket, en bas à droite, transmet un problème ou une suggestion à l\'administrateur.']
    ],
    admin: [
      ['Synthèse', 'Vos chiffres, ceux de l\'équipe, les rappels dus et l\'objectif du 1er septembre 2027 sur un seul écran.'],
      ['Appels et livraisons', 'Vous travaillez comme les commerciales. Sous le formulaire, le bloc d\'administration permet de réattribuer une fiche, de la rendre à la file ou de forcer un statut. Chaque intervention est inscrite au journal.'],
      ['Script d\'appel', 'Le déroulé et les objections s\'ouvrent depuis la fiche, avec le type de client déduit automatiquement.'],
      ['Pilotage', 'Objectif, performance par commerciale, reporting, journal, tickets reçus, exports et administration des données (classeur clients, restauration).'],
      ['Tickets', 'Les tickets envoyés par l\'équipe arrivent dans Pilotage, onglet Tickets, avec la possibilité de répondre et de changer leur statut.']
    ]
  };
  APP.visite = function () {
    var etapes = VISITE[D.moi.role] || VISITE.commercial, i = 0;
    var f = APP.fenetre('<div class="modale verre visite"><div class="etiquette" id="v-etape"></div><h2 id="v-titre"></h2><p class="aide" id="v-texte"></p><div class="progres"><i id="v-barre"></i></div>' +
      '<div class="actions"><button class="btn btn--ghost" type="button" id="v-prec">' + icon('gauche') + 'Précédent</button><button class="btn btn--main" type="button" id="v-suiv">Suivant' + icon('droite') + '</button><button class="btn btn--ghost" type="button" id="v-fin">Fermer</button></div></div>');
    function montrer() {
      var e = etapes[i], corps = $('.visite', f.el);
      $('#v-etape', f.el).textContent = 'Étape ' + (i + 1) + ' sur ' + etapes.length; $('#v-titre', f.el).textContent = e[0]; $('#v-texte', f.el).textContent = e[1];
      $('#v-barre', f.el).style.width = ((i + 1) / etapes.length * 100) + '%'; $('#v-prec', f.el).disabled = i === 0;
      $('#v-suiv', f.el).innerHTML = i === etapes.length - 1 ? 'Terminer' + icon('coche') : 'Suivant' + icon('droite');
      if (!APP.reduit()) { corps.classList.remove('maj'); void corps.offsetWidth; corps.classList.add('maj'); }
    }
    $('#v-prec', f.el).onclick = function () { if (i > 0) { i--; montrer(); } };
    $('#v-suiv', f.el).onclick = function () { if (i < etapes.length - 1) { i++; montrer(); } else f.fermer(); };
    $('#v-fin', f.el).onclick = f.fermer;
    montrer();
    APP.prefMoi('visite', true);
  };

  /* ------------------------------------------------------------------ compte */
  function nouveauMotDePasse() {
    var f = APP.fenetre('<form class="modale verre" novalidate><h2>Changer mon mot de passe</h2><p class="aide">Choisissez un mot de passe d\'au moins 10 caractères, que vous n\'utilisez nulle part ailleurs.</p>' +
      '<div class="champ"><label for="m-mdp">Nouveau mot de passe</label><input class="saisie" id="m-mdp" type="password" autocomplete="new-password"></div>' +
      '<div class="champ"><label for="m-mdp2">Confirmer</label><input class="saisie" id="m-mdp2" type="password" autocomplete="new-password"></div><div class="msgs" id="m-err"></div>' +
      '<div class="actions"><button class="btn btn--main" type="submit">Enregistrer</button><button class="btn btn--ghost" type="button" data-non>Annuler</button></div></form>');
    $('[data-non]', f.el).onclick = f.fermer;
    $('form', f.el).onsubmit = function (e) {
      e.preventDefault();
      var a = $('#m-mdp', f.el).value, b = $('#m-mdp2', f.el).value, z = $('#m-err', f.el);
      var msg = function (t) { z.innerHTML = APP.message('err', esc(t)); };
      if (a.length < 10) return msg('Au moins 10 caractères.');
      if (a !== b) return msg('Les deux mots de passe ne sont pas identiques.');
      APP.session.changerMotDePasse(a).then(function () { f.fermer(); APP.toast('Mot de passe modifié.'); }, function (err) { msg(err.message); });
    };
  }
  function compte() {
    var m = D.moi, maj = D.classeurDate ? H.heureParis(D.classeurDate, true) : '';
    var f = APP.fenetre('<div class="tiroir verre" role="dialog" aria-label="Mon compte">' +
      '<div class="titre-tiroir"><h2>Mon compte</h2><button class="icone-btn" type="button" data-fermer aria-label="Fermer">' + icon('croix') + '</button></div>' +
      '<section class="carte-compte"><span class="avatar avatar--grand" style="--c:' + D.couleur(m.nom) + '">' + esc(m.nom.charAt(0).toUpperCase()) + '</span><div><b>' + esc(m.nom) + '</b><span class="aide">' + esc(D.libelleRole(m.role)) + '</span><span class="aide">' + esc(m.email) + '</span></div></section>' +
      '<section><h3 class="etiquette">Accès</h3><div class="actions"><button class="btn btn--ghost btn--s" type="button" data-mdp>' + icon('lock') + 'Changer mon mot de passe</button><button class="btn btn--ghost btn--s" type="button" data-visite>' + icon('info') + 'Revoir la visite guidée</button></div>' +
      '<p class="aide">Les comptes et les mots de passe sont administrés dans Supabase par l\'administrateur de l\'équipe.</p></section>' +
      '<section><h3 class="etiquette">Données</h3><p class="aide">Classeur clients : <b>' + esc(D.classeurNom || 'non importé') + '</b>' + (maj ? ' · importé le ' + esc(maj) : '') + '<br>' + APP.fmt.entier(D.clients.length) + ' clients · ' + APP.fmt.entier(D.adresses.length) + ' points de livraison · ' + APP.fmt.entier(D.suivi.size) + ' fiches suivies.</p>' +
      '<div class="actions"><button class="btn btn--ghost btn--s" type="button" data-actu>' + icon('refresh') + 'Actualiser maintenant</button></div></section>' +
      '<p class="aide">Cockpit appels ' + APP.VERSION + ' · Hympyr Énergies</p></div>', { classe: 'dlg-tiroir' });
    var el = f.el;
    $('[data-fermer]', el).onclick = f.fermer;
    $('[data-mdp]', el).onclick = function () { f.fermer(); nouveauMotDePasse(); };
    $('[data-visite]', el).onclick = function () { f.fermer(); setTimeout(APP.visite, 250); };
    $('[data-actu]', el).onclick = function () { actualiserMaintenant(); f.fermer(); };
  }
  function actualiserMaintenant() {
    D.synchro = { etat: 'charge', le: D.synchro.le, message: '' }; APP.emettre('synchro');
    return D.actualiser({ force: true }).then(function () { D.synchro = { etat: D.synchro.etat === 'erreur' ? 'erreur' : 'ok', le: D.synchro.le || new Date(), message: D.synchro.message }; puce(); APP.toast('Données actualisées.'); });
  }

  /* ------------------------------------------------------------------ démarrage */
  function entete() {
    var m = D.moi;
    $('#util-ini').textContent = m.nom.charAt(0).toUpperCase(); $('#util-ini').style.setProperty('--c', D.couleur(m.nom));
    $('#util-nom').textContent = m.nom; $('#util-role').textContent = D.libelleRole(m.role);
  }
  function demarrer() {
    entete();
    APP.construireOnglets(D.moi.role);
    var navigation = function (e) { var t = e.target.closest('.tab'); if (t) APP.aller(t.dataset.onglet); };
    $$('.tabs, .basse').forEach(function (c) {
      c.addEventListener('click', navigation);
      c.addEventListener('keydown', function (e) {
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].indexOf(e.key) < 0) return;
        var tabs = $$('.tab', c), i = tabs.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault(); var n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus(); APP.aller(tabs[n].dataset.onglet);
      });
    });
    $('#btn-theme').onclick = APP.theme.basculer; APP.theme.appliquer(APP.theme.courant(), false);
    $('#btn-deco').onclick = function () { APP.confirmer({ titre: 'Se déconnecter ?', texte: 'Vos saisies sont déjà enregistrées dans la base commune.', ok: 'Se déconnecter' }).then(function (ok) { if (ok) APP.verrouiller(); }); };
    $('#util').onclick = compte; $('#puce').onclick = actualiserMaintenant;
    $('#fab').hidden = false; $('#fab').onclick = function () { APP.tickets.ouvrir(); };
    document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input:not([type=checkbox]):not([type=radio]),textarea,select')) document.body.classList.add('saisie-active'); });
    document.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!(a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]),textarea,select'))) document.body.classList.remove('saisie-active'); }, 60); });
    puce();
    var depart = (location.hash || '').replace('#', '') || APP.prefMoi('onglet');
    APP.aller(APP.ongletsDuRole(D.moi.role).indexOf(depart) >= 0 ? depart : 'synthese', { sans: true });
    window.addEventListener('resize', APP.debounce(function () { APP.placerPilules(); APP.placerSegments(); }, 80));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { APP.placerPilules(); APP.placerSegments(); });
    APP.sur('donnees', function (e) { APP.invalider(e && e.sauf); });
    D.demarrerSynchro();
    document.body.classList.add('pret');
    if (!APP.prefMoi('visite')) setTimeout(APP.visite, 900);
    if (D.absent) APP.toast('Le classeur clients n\'a pas encore été importé dans la base.', 'err');
  }

  document.addEventListener('DOMContentLoaded', function () {
    APP.theme.appliquer(APP.theme.courant(), false);
    if (!window.HYM_CONFIG || !window.HYM_CONFIG.API_URL) { document.body.classList.add('pret'); $('#porte').hidden = false; $('#f-charge').hidden = false; $('#ch-etat').hidden = true; $('#ch-err').textContent = 'Adresse du service non configurée (voir README).'; return; }
    connexion(function () { return D.charger(); }).then(demarrer);
  });
})();
