/* Cockpit appels · exports (CSV et Excel) du suivi clients et des points de livraison, et écran Export. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var V = APP.vues.export = { pret: false };
  var EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  var X = APP.exports = {};

  X.jeux = function () {
    var suivi = D.suiviListe().filter(function (s) { return D.parCode.has(String(s.code_client)); });
    suivi.sort(function (a, b) { return String(a.code_client) < String(b.code_client) ? -1 : 1; });
    var clients = { colonnes: H.COLONNES_EXPORT_CLIENTS, lignes: H.exportClients(suivi, D.parCode, D.colCode) };
    var adresses = { colonnes: H.COLONNES_EXPORT_ADRESSES, lignes: H.exportAdresses(D.adresses, D.suiviAdr) };
    return { clients: clients, adresses: adresses };
  };
  X.csv = function (colonnes, lignes) {
    var champ = function (v) { v = String(v === null || v === undefined ? '' : v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [colonnes].concat(lignes).map(function (l) { return l.map(champ).join(';'); }).join('\r\n');
  };
  X.xlsx = function (colonnes, lignes, feuille) {
    return APP.charger(EXCELJS).then(function () {
      var wb = new window.ExcelJS.Workbook(); wb.creator = 'Hympyr Énergies'; wb.created = new Date();
      var ws = wb.addWorksheet(feuille, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.addRow(colonnes);
      lignes.forEach(function (l) { ws.addRow(l.map(function (v) { return v === null || v === undefined ? '' : String(v); })); });
      var tete = ws.getRow(1); tete.height = 24;
      tete.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF073D27' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
      colonnes.forEach(function (c, j) { var max = String(c).length + 2; for (var i = 0; i < Math.min(lignes.length, 200); i++) max = Math.max(max, String(lignes[i][j] || '').split('\n')[0].length + 2); ws.getColumn(j + 1).width = Math.min(max, 45); });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonnes.length } };
      return wb.xlsx.writeBuffer();
    }).then(function (buf) { return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); });
  };
  var date = function () { return H.aujourdhui().replace(/-/g, ''); };
  X.telechargerCsv = function (colonnes, lignes, nom) { APP.telecharger(new Blob([X.csv(colonnes, lignes)], { type: 'text/csv;charset=utf-8' }), nom + '_' + date() + '.csv'); };
  X.telechargerXlsx = function (colonnes, lignes, feuille, nom, btn) {
    if (btn) APP.occupe(btn, 'Préparation…');
    return X.xlsx(colonnes, lignes, feuille).then(function (b) { APP.telecharger(b, nom + '_' + date() + '.xlsx'); }, function (e) { APP.toast('Export Excel impossible : ' + e.message, 'err'); }).finally(function () { if (btn) APP.libere(btn); });
  };

  /** Bloc d'export réutilisé par l'écran Export et par Pilotage. */
  X.bloc = function (racine) {
    var modifs = D.nbModifs(), pret = !!racine._pret, jeux = pret ? (racine._jeux = racine._jeux || X.jeux()) : null;
    var carte = function (cle, titre, nom, feuille, vide) {
      var j = jeux[cle];
      return '<div class="export-carte"><div><h3>' + esc(titre) + '</h3><p class="aide">' + (j.lignes.length ? APP.fmt.entier(j.lignes.length) + ' ligne' + (j.lignes.length > 1 ? 's' : '') + ' prête' + (j.lignes.length > 1 ? 's' : '') + ' à exporter.' : esc(vide)) + '</p></div>' +
        (j.lignes.length ? '<div class="actions"><button class="btn btn--ghost" type="button" data-csv="' + cle + '" data-nom="' + nom + '">' + icon('download') + 'CSV (Excel FR)</button><button class="btn btn--main" type="button" data-xlsx="' + cle + '" data-nom="' + nom + '" data-feuille="' + esc(feuille) + '">' + icon('download') + 'Excel (.xlsx)</button></div>' : '') + '</div>';
    };
    racine.innerHTML =
      (modifs > 0 ? APP.message('warn', '<b>' + APP.fmt.entier(modifs) + ' modification' + (modifs > 1 ? 's' : '') + ' à exporter.</b> Téléchargez les deux fichiers puis confirmez pour remettre le compteur à zéro.') : APP.message('ok', 'Tout est exporté : rien en attente.')) +
      '<p class="aide">Les données sont déjà conservées dans la base commune : les exports ne sont plus nécessaires pour reprendre le travail. Ils servent au contrôle et à l\'archivage.</p>' +
      (pret ? carte('clients', 'Suivi des appels clients', 'suivi_appels_hympyr', 'Suivi appels', 'Aucun appel enregistré pour le moment.') + carte('adresses', 'Points de livraison et référents', 'points_livraison_hympyr', 'Points de livraison', 'Aucun point de livraison à exporter.') : '<div class="actions"><button class="btn btn--main" type="button" data-preparer>' + icon('fichier') + 'Préparer les fichiers d\'export</button></div>') +
      (modifs > 0 ? '<div class="sep"></div><p class="aide">Une fois les deux fichiers téléchargés, confirmez pour repasser au vert.</p><div class="actions"><button class="btn btn--main" type="button" data-confirmer>' + icon('coche') + 'J\'ai bien téléchargé mes sauvegardes</button></div>' : '');
    if (!racine._lie) {
      racine._lie = true;
      racine.addEventListener('click', function (e) {
        var b;
        if (e.target.closest('[data-preparer]')) { racine._pret = true; racine._jeux = null; return X.bloc(racine); }
        if ((b = e.target.closest('[data-csv]'))) { var j = racine._jeux[b.dataset.csv]; return X.telechargerCsv(j.colonnes, j.lignes, b.dataset.nom); }
        if ((b = e.target.closest('[data-xlsx]'))) { var k = racine._jeux[b.dataset.xlsx]; return X.telechargerXlsx(k.colonnes, k.lignes, b.dataset.feuille, b.dataset.nom, b); }
        if ((b = e.target.closest('[data-confirmer]'))) { APP.occupe(b, 'Enregistrement…'); D.confirmerExport().then(function () { APP.toast('Export confirmé.'); X.bloc(racine); }, function (er) { APP.libere(b); APP.toast(er.message, 'err'); }); }
      });
    }
  };

  V.rendre = function () {
    var p = $('#p-export');
    p.innerHTML = U.titre('Export', 'Téléchargez le suivi pour contrôle ou archivage.') + '<section class="carte verre c-export"><div id="x-bloc" class="export-bloc"></div></section>';
    X.bloc($('#x-bloc', p));
  };
  V.actualiser = function () { var b = $('#x-bloc'); if (b) { b._jeux = null; X.bloc(b); } else V.rendre(); };
  V.ouvrir = function () {};
})();
