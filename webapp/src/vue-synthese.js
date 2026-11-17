/* Cockpit appels · écran Synthèse : chiffres du jour, rappels dus, prochains jours, avancement, objectif. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var V = APP.vues.synthese = { pret: false };

  function carteMesChiffres() {
    var s = D.statsDe(D.moi.nom), dus = D.rappelsDus(D.moi.nom), modifs = D.nbModifs();
    var corps = '<div class="tuiles">' +
      U.tuile('Appels aujourd\'hui', '', 'Clients distincts appelés depuis ce matin', { nombre: s.aujourdhui, ton: 'vedette' }) +
      U.tuile('Fiches à votre nom', '', s.terminees ? APP.fmt.entier(s.terminees) + ' terminées' : '', { nombre: s.fiches }) +
      U.tuile('Points de livraison vérifiés', '', s.points_aujourdhui ? '+' + s.points_aujourdhui + ' aujourd\'hui' : '', { nombre: s.points }) +
      U.tuile('Rappels à passer', '', s.a_rappeler ? APP.fmt.entier(s.a_rappeler) + ' programmés au total' : 'Aucun programmé', { nombre: dus.length, ton: dus.length ? 'alerte' : '' }) + '</div>';
    if (D.estRole('commercial') && modifs > 0) corps += '<p class="note-bas">' + icon('info') + '<span>' + APP.fmt.entier(modifs) + ' modification' + (modifs > 1 ? 's' : '') + ' non exportée' + (modifs > 1 ? 's' : '') + ' depuis le dernier export. <button class="lien" type="button" data-aller="export">Ouvrir l\'export</button></span></p>';
    return U.carte('Mes chiffres', corps, { icone: 'user', classe: 'c-moi' });
  }

  function carteRappels() {
    var perso = D.peutTraiter(), liste = D.rappelsDus(perso ? D.moi.nom : null), equipe = perso ? D.rappelsDus(null) : [];
    var corps;
    if (liste.length) {
      var enRetard = liste.filter(function (r) { return r.date < H.aujourdhui(); }).length;
      corps = '<p class="aide">' + liste.length + ' client' + (liste.length > 1 ? 's' : '') + ' à rappeler' + (perso ? ' aujourd\'hui' : ' dans l\'équipe') + (enRetard ? ', dont ' + enRetard + ' en retard' : '') + '.</p>' +
        '<ul class="rappels">' + liste.slice(0, 6).map(function (r) { return U.ligneRappel(r, perso); }).join('') + '</ul>' +
        (liste.length > 6 ? '<p class="aide">Et ' + (liste.length - 6) + ' autre' + (liste.length - 6 > 1 ? 's' : '') + '. <button class="lien" type="button" data-aller="rappels">Voir tous les rappels</button></p>' : '') +
        (perso ? '<div class="actions"><button class="btn btn--main" type="button" data-traiter>' + icon('phone') + 'Traiter mes rappels</button></div>' : '');
    } else {
      corps = U.vide('Aucun rappel à passer', perso ? (equipe.length ? equipe.length + ' rappel' + (equipe.length > 1 ? 's sont dus' : ' est dû') + ' dans l\'équipe, aucun à votre nom.' : 'Rien n\'est dû aujourd\'hui. Les prochains rappels apparaissent dans le calendrier.') : 'Aucun rappel dû dans l\'équipe aujourd\'hui.', 'check');
    }
    return U.carte('Rappels du jour', corps, { icone: 'clock', classe: 'c-rappels' });
  }

  function carteJours() {
    var nb = D.estRole('commercial') ? 15 : 7, perso = D.peutTraiter() ? D.moi.nom : null, aujourdhui = H.aujourdhui();
    var compte = {}; D.rappelsPlanifies(perso).forEach(function (r) { compte[r.date] = (compte[r.date] || 0) + 1; });
    var retard = 0; Object.keys(compte).forEach(function (j) { if (j < aujourdhui) retard += compte[j]; });
    var cases = '';
    for (var i = 0; i < nb; i++) {
      var j = H.ajouterJours(aujourdhui, i), n = compte[j] || 0, cl = H.classeCharge(n, j, aujourdhui);
      cases += '<button type="button" class="jour jour--' + cl + (i === 0 ? ' aujourdhui' : '') + '" data-jour="' + j + '"' + (n ? '' : ' aria-disabled="true"') + ' aria-label="' + esc(APP.fmt.jour(j)) + ' : ' + n + ' rappel' + (n > 1 ? 's' : '') + '"><span class="j">' + H.JOURS_SEMAINE[H.jourSemaine(j)] + '</span><b class="d">' + j.slice(8, 10) + '</b><span class="n">' + (n || '–') + '</span></button>';
    }
    var corps = '<div class="bande-jours" style="--n:' + nb + '">' + cases + '</div>' +
      (retard ? '<p class="aide alerte-texte">' + icon('alert') + retard + ' rappel' + (retard > 1 ? 's' : '') + ' en retard. <button class="lien" type="button" data-jour="retard">Les afficher</button></p>' : '');
    return U.carte('Les ' + nb + ' prochains jours', corps, { icone: 'calendar', classe: 'c-jours' });
  }

  function carteAvancement() {
    var a = D.avancement(), pct = a.total ? a.faits / a.total * 100 : 0, rythme = D.rythmeEquipe();
    var parPersonne = '';
    if (D.peutPiloter()) {
      parPersonne = '<div class="sep"></div><h3 class="etiquette">Par personne</h3><ul class="personnes">' + D.traitants().map(function (nom) {
        var s = D.statsDe(nom); return '<li>' + U.personne(nom) + '<span><b class="num">' + APP.fmt.entier(s.aujourdhui) + '</b> aujourd\'hui</span><span><b class="num">' + APP.fmt.entier(s.fiches) + '</b> fiches</span></li>';
      }).join('') + '</ul>';
    }
    var corps = '<div class="avancement">' + U.anneau(pct, APP.fmt.pct(pct, 1), 'traités') + '<div class="tuiles tuiles--2">' +
      U.tuile('Clients au total', '', '', { nombre: a.total }) + U.tuile('Traités', '', '', { nombre: a.faits }) + U.tuile('Restants', '', '', { nombre: a.restants }) + U.tuile('À rappeler', '', a.doublons ? APP.fmt.entier(a.doublons) + ' doublons repérés' : '', { nombre: a.rappeler }) + '</div></div>' +
      '<p class="note-bas">' + icon('info') + '<span>' + (rythme ? 'Rythme observé : <b>' + Math.round(rythme) + ' fiches par jour actif</b> (équipe).' : 'Le rythme s\'affichera après les premiers appels terminés.') + '</span></p>' + parPersonne;
    return U.carte('Avancement de l\'équipe', corps, { icone: 'users', classe: 'c-avancement' });
  }

  function carteObjectif() {
    var a = D.avancement(), aujourdhui = H.aujourdhui(), o = H.objectif(a.restants, aujourdhui), rythme = D.rythmeEquipe(), corps;
    if (o.jours <= 0) corps = APP.message('err', 'L\'échéance du ' + H.jolieDate(H.ECHEANCE) + ' est atteinte ou dépassée.');
    else {
      var fin = rythme ? H.dateApresJoursOuvres(aujourdhui, Math.round(a.restants / rythme)) : null, ok = rythme && rythme >= o.parJour;
      corps = '<div class="tuiles tuiles--2">' + U.tuile('Jours ouvrés restants', '', '', { nombre: o.jours }) + U.tuile('À traiter par jour', '', 'pour toute l\'équipe', { nombre: o.parJour, ton: 'vedette' }) +
        U.tuile('Rythme observé', rythme ? Math.round(rythme) + '' : '–', 'fiches par jour actif') + U.tuile('Fin estimée', fin ? H.jolieDate(fin) : '–', rythme ? 'au rythme actuel' : 'dès les premiers appels') + '</div>' +
        (rythme ? APP.message(ok ? 'ok' : 'err', ok ? 'Rythme équipe (' + Math.round(rythme) + '/jour) au-dessus de l\'objectif de ' + o.parJour + '/jour.' : 'Rythme équipe (' + Math.round(rythme) + '/jour) sous l\'objectif : il manque environ ' + Math.max(1, Math.round(o.parJour - rythme)) + ' fiche' + (o.parJour - rythme >= 1.5 ? 's' : '') + ' par jour.') : '');
    }
    return U.carte('Objectif du ' + H.jolieDate(H.ECHEANCE), corps, { icone: 'cible', classe: 'c-objectif' });
  }

  V.rendre = function () {
    var p = $('#p-synthese'), perso = D.peutTraiter();
    p.innerHTML = U.titre('Synthèse', esc(APP.fmt.jour(H.aujourdhui()).replace(/^./, function (c) { return c.toUpperCase(); }))) +
      '<div class="grille-synthese">' + (perso ? carteMesChiffres() : '') + carteRappels() + carteJours() + carteAvancement() + carteObjectif() + '</div>';
    if (!V.anime) { V.anime = true; U.animerNombres(p); }
  };
  V.actualiser = function () { V.rendre(); };
  V.ouvrir = function () { var p = $('#p-synthese'); if (!p._lie) { p._lie = true;
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ouvrir]'); if (b) return APP.ouvrirFiche(b.dataset.ouvrir);
      b = e.target.closest('[data-aller]'); if (b) return APP.aller(b.dataset.aller);
      b = e.target.closest('[data-jour]'); if (b && b.getAttribute('aria-disabled') !== 'true') return APP.aller('rappels', { jour: b.dataset.jour, ouvrir: true });
      if (e.target.closest('[data-traiter]')) APP.aller('appels', { jour: 'dus', ouvrir: true });
    }); }
  };
})();
