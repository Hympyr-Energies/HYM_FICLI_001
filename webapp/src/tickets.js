/* Cockpit appels · tickets : envoi depuis le bouton en bas à droite, suivi par l'auteur, gestion par le manager et l'administrateur. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var T = APP.tickets = {};
  var TYPES = [{ v: 'probleme', l: 'Problème' }, { v: 'suggestion', l: 'Suggestion' }, { v: 'question', l: 'Question' }];
  var STATUTS = { nouveau: 'Nouveau', en_cours: 'En cours', traite: 'Traité', clos: 'Clos' };
  var ECRANS = { synthese: 'Synthèse', appels: 'Appels', livraisons: 'Livraisons', rappels: 'Rappels', export: 'Export', pilotage: 'Pilotage' };
  var tonStatut = { nouveau: 'marque', en_cours: '', traite: 'ok', clos: 'neutre' };

  T.contexte = function () {
    var v = APP.vues, ecran = APP.ongletCourant(), fiche = '';
    if (ecran === 'appels' && v.appels.codeAffiche) fiche = v.appels.codeAffiche();
    if (ecran === 'livraisons' && v.livraisons.codeAffiche) fiche = v.livraisons.codeAffiche();
    return { ecran: ecran || '', fiche: fiche, fenetre: window.innerWidth + 'x' + window.innerHeight, theme: APP.theme.courant(), version: APP.VERSION, navigateur: String(navigator.userAgent || '').slice(0, 200), heure: new Date().toISOString() };
  };
  var date = function (iso) { return H.heureParis(String(iso).slice(0, 19), true); };

  function carteTicket(t, gestion) {
    return '<article class="ticket" data-id="' + t.id + '"><header><b>' + esc(t.sujet) + '</b><div class="tags">' + U.tag(TYPES.filter(function (x) { return x.v === t.type; })[0].l) + U.tag(STATUTS[t.statut], tonStatut[t.statut]) + '</div></header>' +
      '<p class="aide">' + (gestion ? esc(t.auteur_nom) + ' · ' : '') + esc(date(t.cree_le)) + (t.page ? ' · écran ' + esc(ECRANS[t.page] || t.page) : '') + '</p><p class="ticket-texte">' + esc(t.message) + '</p>' +
      (t.reponse ? '<div class="ticket-reponse"><small>Réponse' + (t.traite_par ? ' de ' + esc(t.traite_par) : '') + '</small><p>' + esc(t.reponse) + '</p></div>' : '') +
      (gestion ? '<div class="ticket-gestion"><div class="champ"><label for="tr-' + t.id + '">Réponse</label><textarea class="saisie" id="tr-' + t.id + '" rows="2" data-reponse placeholder="Réponse visible par l\'auteur du ticket">' + esc(t.reponse || '') + '</textarea></div>' +
        '<div class="actions">' + Object.keys(STATUTS).map(function (s) { return '<button type="button" class="btn ' + (t.statut === s ? 'btn--main' : 'btn--ghost') + ' btn--s" data-statut="' + s + '">' + STATUTS[s] + '</button>'; }).join('') + '<button type="button" class="btn btn--ghost btn--s" data-envoyer-reponse>Enregistrer la réponse</button></div></div>' : '') + '</article>';
  }
  function liste(racine, gestion) {
    racine.innerHTML = U.squelette(3);
    return APP.nuageSur('ticket_lister', {}).then(function (r) {
      racine._tickets = r.tickets;
      var tous = r.tickets, filtre = racine._filtre || (gestion ? 'ouverts' : 'tous');
      var visibles = tous.filter(function (t) { return filtre === 'tous' || (filtre === 'ouverts' ? (t.statut === 'nouveau' || t.statut === 'en_cours') : t.statut === filtre); });
      var nb = function (f) { return tous.filter(function (t) { return f === 'ouverts' ? (t.statut === 'nouveau' || t.statut === 'en_cours') : true; }).length; };
      racine.innerHTML = (gestion ? '<div class="filtres-ligne">' + U.pastilles([{ v: 'ouverts', l: 'À traiter (' + nb('ouverts') + ')' }, { v: 'traite', l: 'Traités' }, { v: 'clos', l: 'Clos' }, { v: 'tous', l: 'Tous (' + nb('tous') + ')' }], [filtre], 'data-filtre-ticket') + '</div>' : '') +
        (visibles.length ? '<div class="tickets">' + visibles.map(function (t) { return carteTicket(t, gestion); }).join('') + '</div>' : U.vide(gestion ? 'Aucun ticket dans cette vue' : 'Aucun ticket envoyé', gestion ? 'Les tickets envoyés par l\'équipe apparaissent ici.' : 'Vos tickets et les réponses reçues apparaîtront ici.', 'ticket'));
    }, function (e) { racine.innerHTML = APP.message('err', 'Lecture impossible : ' + esc(e.message)); });
  }
  /** Gestion des tickets (manager, administrateur) : à insérer dans Pilotage. */
  T.gerer = function (racine) {
    liste(racine, true);
    if (racine._lie) return; racine._lie = true;
    racine.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filtre-ticket]'); if (b) { racine._filtre = b.getAttribute('data-filtre-ticket'); return liste(racine, true); }
      var carte = e.target.closest('.ticket'); if (!carte) return; var id = +carte.dataset.id, st = e.target.closest('[data-statut]'), rep = e.target.closest('[data-envoyer-reponse]');
      if (!st && !rep) return;
      var corps = { id: id, reponse: $('[data-reponse]', carte).value }; if (st) corps.statut = st.getAttribute('data-statut');
      APP.nuageSur('ticket_maj', corps).then(function () { APP.toast('Ticket mis à jour.'); liste(racine, true); }, function (er) { APP.toast(er.message, 'err'); });
    });
  };

  /** Fenêtre d'envoi (bouton en bas à droite). */
  T.ouvrir = function () {
    var ctx = T.contexte();
    var f = APP.fenetre('<div class="tiroir verre" role="dialog" aria-label="Tickets"><div class="titre-tiroir"><h2>Tickets</h2><button class="icone-btn" type="button" data-fermer aria-label="Fermer">' + icon('croix') + '</button></div>' +
      U.segment([{ v: 'nouveau', l: 'Nouveau ticket' }, { v: 'mes', l: 'Mes tickets' }], 'nouveau', 'data-onglet-ticket', 'seg--plein') + '<div id="tk-corps"></div></div>', { classe: 'dlg-tiroir' });
    var el = f.el, corps = $('#tk-corps', el), seg = $('.seg', el), type = 'probleme';
    function formulaire() {
      corps.innerHTML = '<form id="tk-form" novalidate autocomplete="off" class="ticket-form"><p class="aide">Décrivez ce que vous avez constaté ou ce que vous aimeriez voir évoluer. L\'administrateur reçoit votre message avec l\'écran concerné.</p>' +
        '<div class="champ"><span class="lbl">Nature du ticket</span>' + U.pastilles(TYPES, [type], 'data-type-ticket') + '</div>' +
        '<div class="champ"><label for="tk-sujet">Sujet</label><input class="saisie" id="tk-sujet" maxlength="140" placeholder="En quelques mots"></div>' +
        '<div class="champ"><label for="tk-msg">Message</label><textarea class="saisie" id="tk-msg" rows="6" maxlength="4000" placeholder="Que s\'est-il passé ? Sur quelle fiche ? Qu\'attendiez-vous ?"></textarea><small class="aide compteur" id="tk-cpt">0 / 4000</small></div>' +
        '<label class="interrupteur"><input type="checkbox" id="tk-ctx" checked><i></i><span>Joindre le contexte<small>Écran « ' + esc(ECRANS[ctx.ecran] || ctx.ecran) + '»' + (ctx.fiche ? ', fiche ' + esc(ctx.fiche) : '') + ', navigateur et taille de fenêtre.</small></span></label>' +
        '<div class="msgs" id="tk-err" aria-live="polite"></div><div class="actions"><button class="btn btn--main" type="submit" id="tk-ok">' + icon('send') + 'Envoyer le ticket</button></div></form>';
      $('#tk-sujet', el).focus();
    }
    function merci(id) {
      corps.innerHTML = '<div class="envoye"><span class="envoye-ico">' + icon('coche') + '</span><h3>Ticket envoyé</h3><p class="aide">Votre message a bien été transmis' + (id ? ' (ticket n° ' + id + ')' : '') + '. Vous retrouverez la réponse dans « Mes tickets ».</p><div class="actions"><button class="btn btn--main" type="button" data-fermer>Fermer</button><button class="btn btn--ghost" type="button" data-autre>Envoyer un autre ticket</button></div></div>';
    }
    function mes() { liste(corps, false); }
    APP.segment(seg, 'nouveau', function (v) { if (v === 'mes') mes(); else formulaire(); });
    formulaire();
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-fermer]')) return f.fermer();
      if (e.target.closest('[data-autre]')) return formulaire();
      var b = e.target.closest('[data-type-ticket]'); if (b) { type = b.getAttribute('data-type-ticket'); $$('[data-type-ticket]', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }
    });
    el.addEventListener('input', function (e) { if (e.target.id === 'tk-msg') $('#tk-cpt', el).textContent = e.target.value.length + ' / 4000'; });
    el.addEventListener('submit', function (e) {
      e.preventDefault(); if (e.target.id !== 'tk-form') return;
      var sujet = $('#tk-sujet', el).value.trim(), msg = $('#tk-msg', el).value.trim(), err = $('#tk-err', el), btn = $('#tk-ok', el);
      if (sujet.length < 3 || msg.length < 3) { err.innerHTML = APP.message('err', 'Renseignez un sujet et un message.'); (sujet.length < 3 ? $('#tk-sujet', el) : $('#tk-msg', el)).focus(); return; }
      err.innerHTML = ''; APP.occupe(btn, 'Envoi…');
      APP.nuageSur('ticket_creer', { type: type, sujet: sujet, message: msg, page: ctx.ecran, contexte: $('#tk-ctx', el).checked ? ctx : { ecran: ctx.ecran } }).then(function (r) { merci(r.id); }, function (er) { APP.libere(btn); err.innerHTML = APP.message('err', esc(er.message)); });
    });
  };
})();
