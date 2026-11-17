/* Cockpit appels · écran Pilotage (manager, administrateur) : objectif, équipe, reporting, journal, tickets, exports, données. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var V = APP.vues.pilotage = { pret: false };
  var E = { section: 'objectif', perimetre: 'tous', jours: 30, rapport: null, charge: false };
  var EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

  function sections() {
    var s = [{ v: 'objectif', l: 'Objectif' }, { v: 'equipe', l: 'Équipe' }, { v: 'reporting', l: 'Reporting' }, { v: 'journal', l: 'Journal' }, { v: 'tickets', l: 'Tickets' }];
    if (D.estRole('admin')) s.push({ v: 'exports', l: 'Exports' });
    s.push({ v: 'donnees', l: 'Données' });
    return s;
  }

  /* ------------------------------------------------------------------ objectif */
  function objectif(z) {
    var base = D.base, restant = 0, tous = E.perimetre === 'tous';
    base.forEach(function (b) { if ((tous || H.estPro(b['Type client'])) && !H.estTermine(b.statut)) restant++; });
    var aujourdhui = H.aujourdhui(), o = H.objectif(restant, aujourdhui), rythme = D.rythmeEquipe(), verdict = '';
    if (o.jours > 0) {
      if (!rythme) verdict = APP.message('info', 'Le rythme s\'affichera après les premiers appels enregistrés.');
      else if (rythme >= o.parJour) verdict = APP.message('ok', 'Au rythme actuel (' + Math.round(rythme) + '/jour), l\'échéance est tenable sur ce périmètre.');
      else { var fin = H.dateApresJoursOuvres(aujourdhui, Math.round(restant / rythme)); verdict = APP.message('err', 'Au rythme actuel (' + Math.round(rythme) + '/jour), fin estimée vers le <b>' + H.jolieDate(fin) + '</b>, soit après l\'échéance. Il faut viser ' + o.parJour + '/jour, ou renforcer l\'équipe.'); }
    } else verdict = APP.message('err', 'L\'échéance est atteinte ou dépassée.');
    var dus = D.rappelsDus(null);
    z.innerHTML = U.carte('Tenir l\'échéance du ' + H.jolieDate(H.ECHEANCE), '<p class="aide">Émission de la facturation électronique pour les PME.</p>' +
      '<div class="champ"><span class="lbl">Périmètre à boucler</span>' + U.segment([{ v: 'tous', l: 'Tous les clients restants' }, { v: 'pros', l: 'Uniquement les pros (conformité)' }], E.perimetre, 'data-perimetre') + '</div>' +
      '<div class="tuiles">' + U.tuile('Restant sur ce périmètre', '', '', { nombre: restant }) + U.tuile('Jours ouvrés avant l\'échéance', '', '', { nombre: Math.max(0, o.jours) }) + U.tuile('À traiter par jour', o.parJour === null ? '–' : '', 'pour toute l\'équipe', o.parJour === null ? {} : { nombre: o.parJour, ton: 'vedette' }) + U.tuile('Rythme équipe par jour', rythme ? Math.round(rythme) + '' : '–', rythme && o.parJour ? (Math.round(rythme) - o.parJour >= 0 ? '+' : '') + (Math.round(rythme) - o.parJour) + ' par rapport à l\'objectif' : '') + '</div>' + verdict, { icone: 'cible' }) +
      U.carte('Rappels à passer aujourd\'hui ou en retard', dus.length ? '<ul class="rappels">' + dus.slice(0, 30).map(function (r) { return U.ligneRappel(r, false); }).join('') + '</ul>' + (dus.length > 30 ? '<p class="aide">Et ' + (dus.length - 30) + ' autres : voir l\'écran Rappels.</p>' : '') : U.vide('Aucun rappel dû', 'Aucun rappel n\'est à passer aujourd\'hui ni en retard.', 'check'), { icone: 'clock' });
    APP.segment($('.seg', z), E.perimetre, function (v) { E.perimetre = v; objectif(z); });
  }

  /* ------------------------------------------------------------------ équipe */
  function equipe(z) {
    var personnes = D.commerciales(), tableau = personnes.map(function (n) { return { nom: n, s: D.statsDe(n) }; });
    var cartes = tableau.map(function (x) {
      return '<div class="carte-personne verre"><h3>' + U.personne(x.nom) + '</h3><div class="tuiles tuiles--2">' + U.tuile('Appels aujourd\'hui', '', '', { nombre: x.s.aujourdhui, ton: 'vedette' }) + U.tuile('Fiches terminées', '', 'sur ' + APP.fmt.entier(x.s.fiches) + ' traitées', { nombre: x.s.terminees }) + U.tuile('Rythme par jour actif', x.s.rythme ? Math.round(x.s.rythme) + '' : '–', '') + U.tuile('Points vérifiés', '', x.s.points_aujourdhui ? '+' + x.s.points_aujourdhui + ' aujourd\'hui' : '', { nombre: x.s.points }) + U.tuile('Rappels en cours', '', '', { nombre: x.s.a_rappeler }) + '</div></div>';
    }).join('');
    var tab = U.tableau([{ l: 'Commerciale', k: function (x) { return U.personne(x.nom); }, brut: true }, { l: 'Fiches traitées', k: function (x) { return APP.fmt.entier(x.s.fiches); }, n: true }, { l: 'Dont terminées', k: function (x) { return APP.fmt.entier(x.s.terminees); }, n: true }, { l: 'Aujourd\'hui', k: function (x) { return APP.fmt.entier(x.s.aujourdhui); }, n: true }, { l: 'Rappels en cours', k: function (x) { return APP.fmt.entier(x.s.a_rappeler); }, n: true }, { l: 'Points de livraison', k: function (x) { return APP.fmt.entier(x.s.points); }, n: true }, { l: 'Rythme par jour actif', k: function (x) { return x.s.rythme ? (Math.round(x.s.rythme * 10) / 10).toLocaleString('fr-FR') : '–'; }, n: true }], tableau);
    var av = D.avancement(), admins = D.admins().map(function (n) { var s = D.statsDe(n); return s.fiches || s.points ? '<p class="aide">Hors périmètre commercial : ' + APP.fmt.entier(s.fiches) + ' fiche' + (s.fiches > 1 ? 's' : '') + ' et ' + APP.fmt.entier(s.points) + ' point' + (s.points > 1 ? 's' : '') + ' de livraison traités par ' + esc(n) + ' (administrateur).</p>' : ''; }).join('');
    var aujourdhui = H.aujourdhui(), jours = [], i; for (i = 29; i >= 0; i--) jours.push(H.ajouterJours(aujourdhui, -i));
    var par = {}; D.suiviListe().forEach(function (s) { if (personnes.indexOf(s.traite_par) < 0) return; var j = H.jourDe(s.maj_le); if (!j) return; (par[j] = par[j] || {})[s.traite_par] = ((par[j] || {})[s.traite_par] || 0) + 1; });
    var graphe = U.barresTemps(jours.map(function (j) { return { jour: j, valeurs: par[j] || {} }; }), personnes.map(function (n) { return { nom: n, couleur: D.couleur(n) }; }));
    var statuts = H.STATUTS.map(function (s) { return { l: H.libelle(s), v: D.base.filter(function (b) { return b.statut === s; }).length }; });
    var typesCount = {}; D.base.forEach(function (b) { var t = b['Type client'] || 'Non renseigné'; typesCount[t] = (typesCount[t] || 0) + 1; });
    var types = Object.keys(typesCount).map(function (t) { return { l: t, v: typesCount[t] }; }).sort(function (a, b) { return b.v - a.v; });
    var prod = {}; D.suiviListe().forEach(function (s) { H.texte(s.produits).split('|').forEach(function (p) { if (H.PRODUITS.indexOf(p) >= 0) prod[p] = (prod[p] || 0) + 1; }); });
    var produits = Object.keys(prod).map(function (p) { return { l: p, v: prod[p] }; }).sort(function (a, b) { return b.v - a.v; });
    z.innerHTML = U.carte('Performance des commerciales', '<p class="aide">Alimenté directement par la saisie de l\'équipe, sans ressaisie.</p><div class="cartes-personnes">' + cartes + '</div>' + tab + admins + '<p class="aide">' + APP.fmt.entier(av.nonAttribuees) + ' fiche' + (av.nonAttribuees > 1 ? 's ne sont encore attribuées' : ' n\'est encore attribuée') + ' à personne.</p>', { icone: 'users' }) +
      U.carte('Fiches traitées par jour', graphe + '<p class="aide">Trente derniers jours, d\'après la date de dernière modification des fiches.</p>', { icone: 'chart' }) +
      U.carte('Avancement de la campagne', '<div class="tuiles">' + U.tuile('Total clients', '', '', { nombre: av.total }) + U.tuile('Traités', '', '', { nombre: av.faits, ton: 'vedette' }) + U.tuile('À rappeler', '', '', { nombre: av.rappeler }) + U.tuile('Doublons repérés', '', '', { nombre: av.doublons }) + '</div>' +
        '<div class="deux-col"><div><h3 class="etiquette">Répartition par statut</h3>' + U.barresH(statuts) + '</div><div><h3 class="etiquette">Répartition par type de client</h3>' + U.barresH(types) + '</div></div>' +
        (produits.length ? '<div class="sep"></div><h3 class="etiquette">Produits achetés déclarés en appel</h3>' + U.barresH(produits) : ''), { icone: 'cible' });
  }

  /* ------------------------------------------------------------------ reporting */
  function reporting(z) {
    z.innerHTML = U.carte('Reporting journalier des appels', '<p class="aide">Nombre de clients distincts appelés chaque jour, d\'après le journal des appels. Les réattributions et corrections administratives n\'y figurent pas.</p>' +
      U.segment([{ v: '7', l: '7 jours' }, { v: '30', l: '30 jours' }, { v: '90', l: '90 jours' }], String(E.jours), 'data-periode') + '<div id="rp-corps">' + U.squelette(3) + '</div>', { icone: 'phone' });
    APP.segment($('.seg', z), String(E.jours), function (v) { E.jours = +v; E.rapport = null; reporting(z); });
    var charger = E.rapport && E.rapport.jours === E.jours ? Promise.resolve(E.rapport) : D.rapport(E.jours).then(function (r) { r.jours = E.jours; E.rapport = r; return r; });
    charger.then(function (r) {
      var rap = H.rapportJournalier(r.appels, E.jours, H.aujourdhui()), c = $('#rp-corps', z); if (!c) return;
      if (rap.vide) { c.innerHTML = U.vide('Aucun appel enregistré sur cette période', 'Le journal des appels compte les clients distincts appelés par jour. Aucun appel n\'a été enregistré sur ' + E.jours + ' jours.', 'phone'); return; }
      var moy = rap.jours_actifs ? rap.total / rap.jours_actifs : 0;
      var series = rap.personnes.map(function (n) { return { nom: n, couleur: D.couleur(n) }; });
      var tab = U.tableau([{ l: 'Jour', k: function (l) { return APP.fmt.jourCourt(l.jour); } }].concat(rap.personnes.map(function (n) { return { l: n, k: function (l) { return l[n]; }, n: true }; }), [{ l: 'Total', k: 'total', n: true }]), rap.tableau.slice().reverse());
      var statutsAll = []; Object.keys(rap.parStatut).forEach(function (p) { Object.keys(rap.parStatut[p]).forEach(function (s) { if (statutsAll.indexOf(s) < 0) statutsAll.push(s); }); }); statutsAll.sort(function (a, b) { return H.STATUTS.indexOf(a) - H.STATUTS.indexOf(b); });
      var tabStatut = U.tableau([{ l: 'Personne', k: function (p) { return U.personne(p); }, brut: true }].concat(statutsAll.map(function (s) { return { l: H.libelle(s), k: function (p) { return rap.parStatut[p][s] || 0; }, n: true }; })), Object.keys(rap.parStatut).sort());
      c.innerHTML = '<div class="tuiles">' + U.tuile('Appels sur la période', '', '', { nombre: rap.total, ton: 'vedette' }) + U.tuile('Jours travaillés', '', '', { nombre: rap.jours_actifs }) + U.tuile('Moyenne par jour travaillé', Math.round(moy) + '', '') + U.tuile('Points de livraison vérifiés', '', '', { nombre: rap.points }) + '</div>' +
        '<h3 class="etiquette">Appels par jour et par personne</h3>' + U.barresTemps(rap.tableau.map(function (l) { var v = {}; rap.personnes.forEach(function (n) { v[n] = l[n]; }); return { jour: l.jour, valeurs: v }; }), series) +
        '<h3 class="etiquette">Détail par jour</h3>' + '<div class="tbl-scroll">' + tab + '</div><h3 class="etiquette">Résultat des appels par personne</h3>' + tabStatut +
        '<div class="actions"><button class="btn btn--ghost" type="button" id="rp-csv">' + icon('download') + 'Télécharger le reporting (CSV)</button></div>' +
        (rap.hors_appels ? '<p class="aide">' + APP.fmt.entier(rap.hors_appels) + ' opération' + (rap.hors_appels > 1 ? 's administratives' : ' administrative') + ' sur la période (réattributions, restaurations) exclue' + (rap.hors_appels > 1 ? 's' : '') + ' de ce comptage.</p>' : '');
      $('#rp-csv', c).onclick = function () { APP.exports.telechargerCsv(['Jour'].concat(rap.personnes, ['Total']), rap.tableau.map(function (l) { return [l.jour].concat(rap.personnes.map(function (n) { return l[n]; }), [l.total]); }), 'appels_hympyr'); };
    }, function (e) { var c = $('#rp-corps', z); if (c) c.innerHTML = APP.message('err', 'Lecture impossible : ' + esc(e.message)); });
  }

  /* ------------------------------------------------------------------ journal */
  function journal(z) {
    z.innerHTML = U.carte('Journal des interventions manuelles', '<p class="aide">Réattributions et forçages de statut effectués par un administrateur, avec l\'état antérieur.</p><div id="jn-corps">' + U.squelette(3) + '</div>', { icone: 'shield' });
    D.rapport(1).then(function (r) {
      var c = $('#jn-corps', z); if (!c) return;
      c.innerHTML = r.journal.length ? U.tableau([{ l: 'Quand', k: function (l) { return H.heureParis(l.horodatage, true); } }, { l: 'Par qui', k: 'auteur' }, { l: 'Action', k: 'action' }, { l: 'Fiche', k: 'cible' }, { l: 'Détail', k: 'detail' }], r.journal) : U.vide('Aucune intervention', 'Aucune intervention manuelle n\'a été enregistrée.', 'check');
    }, function (e) { var c = $('#jn-corps', z); if (c) c.innerHTML = APP.message('err', 'Lecture impossible : ' + esc(e.message)); });
  }

  /* ------------------------------------------------------------------ données : classeur, restauration, réinitialisation */
  function donnees(z) {
    var admin = D.estRole('admin'), manager = D.estRole('manager'), maj = D.classeurDate ? H.heureParis(D.classeurDate, true) : '';
    var corps = U.carte('Classeur clients', '<p class="aide">Fichier source en base : <b>' + esc(D.classeurNom || 'aucun') + '</b>' + (maj ? ', importé le ' + esc(maj) : '') + '.<br>' + APP.fmt.entier(D.clients.length) + ' clients et ' + APP.fmt.entier(D.adresses.length) + ' points de livraison.</p>' +
      (admin ? '<div class="actions"><label class="btn btn--ghost" for="dn-classeur">' + icon('upload') + 'Importer un nouveau classeur (.xlsx)</label><input type="file" id="dn-classeur" class="sr" accept=".xlsx"></div><div id="dn-classeur-msg" class="msgs"></div><p class="aide">Remplace la liste des clients et des points de livraison. Le suivi des appels n\'est pas modifié : les fiches déjà saisies restent rattachées à leur code client.</p>' : '<p class="aide">L\'import d\'un nouveau classeur est réservé à l\'administrateur.</p>'), { icone: 'base' });
    if (admin) corps += U.carte('Restaurer une sauvegarde', '<p class="aide">Recharge un export CSV du suivi dans la base. La sauvegarde fait foi : elle réécrit les fiches telles qu\'exportées, y compris les champs vides. À utiliser uniquement pour reprendre un état antérieur.</p>' +
      '<div class="rang"><div class="champ"><span class="lbl">Suivi clients (.csv)</span><label class="btn btn--ghost" for="dn-csv-c">' + icon('upload') + 'Choisir un fichier</label><input type="file" id="dn-csv-c" class="sr" accept=".csv,text/csv"></div><div class="champ"><span class="lbl">Référents des points de livraison (.csv)</span><label class="btn btn--ghost" for="dn-csv-a">' + icon('upload') + 'Choisir un fichier</label><input type="file" id="dn-csv-a" class="sr" accept=".csv,text/csv"></div></div><div id="dn-csv-msg" class="msgs"></div>', { icone: 'refresh' });
    if (manager) corps += U.carte('Réinitialisation (zone sensible)', '<p class="aide">Efface tout le suivi : fiches, référents, journal des appels et journal des interventions. Le classeur clients et l\'historique des versions de fiches sont conservés. <b>Cette opération est irréversible : exportez le suivi avant.</b> Elle reste réservée au profil manager, y compris pour l\'administrateur.</p>' +
      '<div class="champ"><label for="dn-reset">Saisissez RESET pour confirmer</label><input class="saisie" id="dn-reset" autocomplete="off" placeholder="RESET"></div><div class="actions"><button class="btn btn--danger" type="button" id="dn-reset-ok" disabled>' + icon('trash') + 'Tout réinitialiser</button></div>', { icone: 'alert', classe: 'carte--danger' });
    z.innerHTML = corps;
    var r = $('#dn-reset', z); if (r) { r.oninput = function () { $('#dn-reset-ok', z).disabled = r.value.trim().toUpperCase() !== 'RESET'; }; $('#dn-reset-ok', z).onclick = function () {
      APP.confirmer({ titre: 'Tout réinitialiser ?', texte: 'Le suivi, les référents et les journaux seront définitivement effacés pour toute l\'équipe.', ok: 'Effacer définitivement', danger: true }).then(function (ok) {
        if (!ok) return; var b = $('#dn-reset-ok', z); APP.occupe(b, 'Effacement…');
        APP.nuageSur('reinitialiser', { confirmation: 'RESET' }).then(function () { return D.charger(); }).then(function () { APP.toast('Suivi réinitialisé.'); donnees(z); }, function (e) { APP.libere(b); APP.toast(e.message, 'err'); });
      }); }; }
    var c = $('#dn-classeur', z); if (c) c.onchange = function () { if (c.files[0]) importerClasseur(c.files[0], $('#dn-classeur-msg', z)); };
    var a = $('#dn-csv-c', z); if (a) a.onchange = function () { if (a.files[0]) restaurer(a.files[0], 'client', $('#dn-csv-msg', z)); };
    var b = $('#dn-csv-a', z); if (b) b.onchange = function () { if (b.files[0]) restaurer(b.files[0], 'adresse', $('#dn-csv-msg', z)); };
  }
  function restaurer(fichier, type, zone) {
    zone.innerHTML = '';
    fichier.text().then(function (t) {
      var lignes = type === 'client' ? H.lignesRestaurationClients(H.lireCsv(t)) : H.lignesRestaurationAdresses(H.lireCsv(t));
      if (!lignes.length) { zone.innerHTML = APP.message('warn', 'Aucune ligne exploitable dans « ' + esc(fichier.name) + ' ».'); return; }
      return APP.confirmer({ titre: 'Restaurer ' + lignes.length + ' ' + (type === 'client' ? 'fiche' : 'point') + (lignes.length > 1 ? 's' : '') + ' ?', texte: 'Les fiches du fichier « ' + fichier.name + ' » vont réécrire celles de la base, y compris les champs vides. Cette opération ne peut pas être annulée.', ok: 'Restaurer', danger: true }).then(function (ok) {
        if (!ok) return; var n = 0;
        function lot() {
          if (n >= lignes.length) { zone.innerHTML = APP.message('ok', lignes.length + ' ' + (type === 'client' ? 'fiche' : 'point') + (lignes.length > 1 ? 's restaurés' : ' restauré') + '.'); return D.charger().then(function () { APP.invalider(); }); }
          zone.innerHTML = APP.message('info', 'Restauration en cours : ' + n + ' sur ' + lignes.length + '…');
          return APP.nuageSur('restaurer', { type: type, lignes: lignes.slice(n, n + 100) }, 60000).then(function () { n += 100; return lot(); });
        }
        return lot();
      });
    }).catch(function (e) { zone.innerHTML = APP.message('err', 'Restauration impossible : ' + esc(e.message)); });
  }
  function importerClasseur(fichier, zone) {
    zone.innerHTML = APP.message('info', 'Lecture de « ' + esc(fichier.name) + ' »…');
    Promise.all([fichier.arrayBuffer(), APP.charger(EXCELJS)]).then(function (r) {
      var wb = new window.ExcelJS.Workbook();
      return wb.xlsx.load(r[0]).then(function () { return wb; });
    }).then(function (wb) {
      var feuille = function (nom) { var ws = wb.getWorksheet(nom); if (!ws) return null; var lignes = []; ws.eachRow({ includeEmpty: false }, function (row) { var v = row.values.slice(1); lignes.push(v.map(function (x) { return cellule(x); })); }); return lignes; };
      var cl = feuille('Clients'); if (!cl || !cl.length) throw new Error('La feuille « Clients » est introuvable.');
      var ad = feuille('Adresses livraison');
      var n = H.normaliserClasseur(cl[0], cl.slice(1), ad && ad.length ? ad[0] : [], ad && ad.length ? ad.slice(1) : []);
      if (!n.colCode) throw new Error('La feuille « Clients » doit contenir une colonne « Code client ».');
      zone.innerHTML = '';
      return APP.confirmer({ titre: 'Importer ce classeur ?', html: '<b>' + esc(fichier.name) + '</b><br>' + APP.fmt.entier(n.clients.lignes.length) + ' clients et ' + APP.fmt.entier(n.adresses.lignes.length) + ' points de livraison (actuellement ' + APP.fmt.entier(D.clients.length) + ' et ' + APP.fmt.entier(D.adresses.length) + ').<br>Le suivi des appels est conservé.', ok: 'Importer' }).then(function (ok) {
        if (!ok) return; var envoyes = 0, total = n.clients.lignes.length + n.adresses.lignes.length;
        function envoyer(cle, t, debut) {
          if (debut >= t.lignes.length) return APP.nuageSur('classeur_publier', { cle: cle, attendu: t.lignes.length }, 60000);
          zone.innerHTML = APP.message('info', 'Envoi en cours : ' + APP.fmt.entier(envoyes) + ' sur ' + APP.fmt.entier(total) + ' lignes…');
          return APP.nuageSur('classeur_ajouter', { cle: cle, colonnes: t.colonnes, lignes: t.lignes.slice(debut, debut + 800), nom: fichier.name, debut: debut === 0 }, 60000).then(function () { envoyes += Math.min(800, t.lignes.length - debut); return envoyer(cle, t, debut + 800); });
        }
        return envoyer('clients', n.clients, 0).then(function () { return n.adresses.lignes.length ? envoyer('adresses', n.adresses, 0) : null; }).then(function () { return D.charger(); }).then(function () { zone.innerHTML = APP.message('ok', 'Classeur importé : ' + APP.fmt.entier(D.clients.length) + ' clients et ' + APP.fmt.entier(D.adresses.length) + ' points de livraison.'); APP.invalider(); });
      });
    }).catch(function (e) { zone.innerHTML = APP.message('err', 'Import impossible : ' + esc(e.message)); });
  }
  function cellule(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') { if (v instanceof Date) return v.toISOString().slice(0, 10); if (v.richText) return v.richText.map(function (r) { return r.text; }).join(''); if (v.text !== undefined) return String(v.text); if (v.result !== undefined) return String(v.result); return ''; }
    return String(v);
  }

  /* ------------------------------------------------------------------ cycle de vie */
  var RENDU = { objectif: objectif, equipe: equipe, reporting: reporting, journal: journal, donnees: donnees,
    tickets: function (z) { z.innerHTML = U.carte('Tickets de l\'équipe', '<div id="tk-liste"></div>', { icone: 'ticket' }); APP.tickets.gerer($('#tk-liste', z)); },
    exports: function (z) { z.innerHTML = U.carte('Exports', '<div class="export-bloc" id="px-bloc"></div>', { icone: 'download' }); APP.exports.bloc($('#px-bloc', z)); } };
  function section() {
    var z = $('#pl-corps'); if (!z) return;
    if (!RENDU[E.section] || !sections().some(function (s) { return s.v === E.section; })) E.section = 'objectif';
    RENDU[E.section](z); U.animerNombres(z); APP.placerSegments();
    if (!APP.reduit()) { z.classList.remove('entre'); void z.offsetWidth; z.classList.add('entre'); }
  }
  V.rendre = function () {
    var p = $('#p-pilotage'); E.section = APP.prefMoi('pilotage') || E.section;
    p.innerHTML = U.titre('Pilotage', 'Tenir l\'échéance, suivre l\'équipe et les demandes.') + '<div class="sections-barre">' + U.segment(sections(), E.section, 'data-section', 'seg--defile') + '</div><div id="pl-corps" class="pl-corps"></div>';
    var seg = $('.sections-barre .seg', p); APP.segment(seg, E.section, function (v) { E.section = v; APP.prefMoi('pilotage', v); section(); });
    section();
  };
  V.actualiser = function () { if (['objectif', 'equipe'].indexOf(E.section) >= 0) section(); };
  V.ouvrir = function () { APP.placerSegments(); };
})();
