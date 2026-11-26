/* Cockpit appels · éléments d'interface partagés : en-têtes, tuiles, pastilles, tableaux, graphiques en barres. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, esc = APP.esc, icon = APP.icon;
  var U = APP.ui = {};

  U.titre = function (h1, sous, actions) {
    return '<div class="titre"><div><h1>' + esc(h1) + '</h1>' + (sous ? '<p>' + sous + '</p>' : '') + '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  };
  U.carte = function (titre, corps, opts) {
    opts = opts || {};
    return '<section class="carte verre ' + (opts.classe || '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>' + (titre ? '<h2>' + (opts.icone ? icon(opts.icone) : '') + '<span>' + esc(titre) + '</span>' + (opts.droite ? '<span class="h2-droite">' + opts.droite + '</span>' : '') + '</h2>' : '') + corps + '</section>';
  };
  U.tuile = function (libelle, valeur, sous, opts) {
    opts = opts || {};
    return '<div class="tuile' + (opts.ton ? ' tuile--' + opts.ton : '') + '"><span class="l">' + esc(libelle) + '</span><b class="v num"' + (opts.nombre !== undefined ? ' data-nombre="' + opts.nombre + '"' : '') + '>' + (opts.nombre !== undefined ? APP.fmt.entier(opts.nombre) : valeur) + '</b>' + (sous ? '<small>' + sous + '</small>' : '') + '</div>';
  };
  /** Tuiles dont le nombre s'anime à l'affichage. */
  U.animerNombres = function (racine) {
    APP.$$('[data-nombre]', racine).forEach(function (el) { APP.compter(el, parseFloat(el.dataset.nombre), el.dataset.format === 'pct' ? function (n) { return APP.fmt.pct(n, 0); } : APP.fmt.entier); });
  };
  U.personne = function (nom) {
    if (!nom) return '<span class="tag tag--neutre">Non traité</span>';
    return '<span class="tag tag--personne" style="--c:' + APP.D.couleur(nom) + '"><i></i>' + esc(nom) + '</span>';
  };
  /** Numéro de fiche saisissable dans la barre de navigation : on tape 150 puis Entrée pour ouvrir la 150e fiche de la file.
   *  input : le champ ; total() : taille de la file ; aller(index0) : ouvre la fiche (la vue gère la confirmation de sortie). */
  U.lierPosition = function (input, total, aller) {
    var avant = '';
    input.addEventListener('focus', function () { avant = input.value; input.select(); });
    function valider() {
      var n = total(), brut = input.value.replace(/\s/g, ''), v = parseInt(brut, 10);
      if (!brut || brut === avant) { input.value = avant; return; }
      if (!/^\d+$/.test(brut) || !n || v < 1 || v > n) {
        input.value = avant; input.setAttribute('aria-invalid', 'true');
        APP.toast(n ? 'Saisissez un numéro entre 1 et ' + APP.fmt.entier(n) + '.' : 'La file est vide.', 'err');
        return;
      }
      input.setAttribute('aria-invalid', 'false'); avant = String(v); aller(v - 1);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); valider(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); input.value = avant; input.blur(); }
    });
    input.addEventListener('change', valider);
  };
  /** Affiche la position courante sans écraser une saisie en cours. */
  U.majPosition = function (input, pos) { if (document.activeElement !== input) input.value = pos >= 0 ? String(pos + 1) : ''; input.removeAttribute('aria-invalid'); };
  U.tag = function (texte, ton) { return '<span class="tag' + (ton ? ' tag--' + ton : '') + '">' + esc(texte) + '</span>'; };
  U.progres = function (pct) { return '<div class="progres" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>'; };
  U.anneau = function (pct, centre, sous) {
    var r = 52, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
    return '<div class="anneau" role="img" aria-label="' + Math.round(p) + ' pour cent"><svg viewBox="0 0 120 120"><circle class="fond" cx="60" cy="60" r="' + r + '"/><circle class="val" cx="60" cy="60" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(1) + '" transform="rotate(-90 60 60)"/></svg><div class="centre"><b class="num">' + centre + '</b>' + (sous ? '<small>' + sous + '</small>' : '') + '</div></div>';
  };
  U.vide = function (titre, texte, ico, action) {
    return '<div class="vide">' + (ico ? '<span class="vide-ico">' + icon(ico) + '</span>' : '') + '<b>' + esc(titre) + '</b>' + (texte ? '<p>' + texte + '</p>' : '') + (action || '') + '</div>';
  };
  U.squelette = function (n) { var s = ''; for (var i = 0; i < (n || 3); i++) s += '<div class="squelette"></div>'; return '<div class="squelettes">' + s + '</div>'; };
  /** Pastilles à choix multiple ou exclusif : items = [{v, l}], sel = tableau des valeurs actives. */
  U.pastilles = function (items, sel, attr, opts) {
    opts = opts || {};
    return '<div class="pastilles' + (opts.classe ? ' ' + opts.classe : '') + '" role="group"' + (opts.label ? ' aria-label="' + esc(opts.label) + '"' : '') + '>' + items.map(function (it) {
      var on = sel.indexOf(it.v) >= 0;
      return '<button type="button" class="pastille" ' + attr + '="' + esc(it.v) + '" aria-pressed="' + on + '">' + (on ? '<span class="coche">' + icon('coche') + '</span>' : '') + esc(it.l) + '</button>';
    }).join('') + '</div>';
  };
  U.segment = function (items, sel, attr, classe) {
    return '<div class="seg ' + (classe || '') + '" role="group">' + items.map(function (it) { return '<button type="button" ' + attr + ' data-v="' + esc(it.v) + '" aria-pressed="' + (it.v === sel) + '">' + esc(it.l) + '</button>'; }).join('') + '</div>';
  };
  /** Tableau : colonnes = [{l, k (clé ou fonction), n (numérique)}] ; sur mobile chaque ligne devient une carte. */
  U.tableau = function (colonnes, lignes, opts) {
    opts = opts || {};
    var th = colonnes.map(function (c) { return '<th' + (c.n ? ' class="n"' : '') + '>' + esc(c.l) + '</th>'; }).join('');
    var corps = lignes.map(function (l) {
      return '<tr' + (opts.ligne ? ' ' + opts.ligne(l) : '') + '>' + colonnes.map(function (c) { var v = typeof c.k === 'function' ? c.k(l) : l[c.k]; return '<td' + (c.n ? ' class="n"' : '') + ' data-label="' + esc(c.l) + '">' + (c.brut ? v : esc(v === undefined || v === null ? '' : v)) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + th + '</tr></thead><tbody>' + (corps || '<tr><td colspan="' + colonnes.length + '" class="tbl-vide">Aucune donnée</td></tr>') + '</tbody></table></div>';
  };

  /** Barres dans le temps : jours = [{jour, valeurs:{série:n}}], séries = [{nom, couleur}] ; empilées. */
  U.barresTemps = function (jours, series, opts) {
    opts = opts || {};
    var max = 0; jours.forEach(function (j) { var t = 0; series.forEach(function (s) { t += j.valeurs[s.nom] || 0; }); max = Math.max(max, t); });
    if (!max) return '<div class="graph-vide">Aucune donnée sur la période.</div>';
    var pas = jours.length > 45 ? 14 : jours.length > 20 ? 7 : jours.length > 10 ? 2 : 1;
    var graduation = niceMax(max), cols = jours.map(function (j, i) {
      var total = 0, segs = series.map(function (s) { var v = j.valeurs[s.nom] || 0; total += v; return v ? '<i style="height:' + (v / graduation * 100).toFixed(2) + '%;background:' + s.couleur + '"></i>' : ''; }).join('');
      var detail = APP.fmt.jourCourt(j.jour) + ' : ' + total + (series.length > 1 ? ' (' + series.map(function (s) { return s.nom + ' ' + (j.valeurs[s.nom] || 0); }).join(', ') + ')' : '');
      return '<div class="col" title="' + esc(detail) + '"><div class="pile-barre" role="img" aria-label="' + esc(detail) + '">' + segs + '</div><span class="lib">' + (i % pas === 0 ? j.jour.slice(8, 10) + '/' + j.jour.slice(5, 7) : '') + '</span></div>';
    }).join('');
    var lignes = [0, .5, 1].map(function (f) { return '<span class="ligne-g" style="bottom:' + (f * 100) + '%"><em>' + Math.round(graduation * f) + '</em></span>'; }).join('');
    var legende = series.length > 1 ? '<div class="legende">' + series.map(function (s) { return '<span><i style="background:' + s.couleur + '"></i>' + esc(s.nom) + '</span>'; }).join('') + '</div>' : '';
    return '<div class="graph"><div class="barres-temps" style="--n:' + jours.length + '"><div class="grille-g">' + lignes + '</div><div class="cols">' + cols + '</div></div>' + legende + '</div>';
  };
  function niceMax(m) { var e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e, n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return Math.max(2, n * e); }
  /** Barres horizontales : items = [{l, v, couleur?}] ; la longueur est relative au plus grand. */
  U.barresH = function (items, opts) {
    opts = opts || {};
    var max = 0; items.forEach(function (i) { max = Math.max(max, i.v); });
    if (!max) return '<div class="graph-vide">Aucune donnée.</div>';
    return '<ul class="barres-h">' + items.map(function (i) {
      return '<li><span class="b-lib">' + esc(i.l) + '</span><span class="b-piste"><i style="width:' + (i.v / max * 100).toFixed(1) + '%' + (i.couleur ? ';background:' + i.couleur : '') + '"></i></span><b class="num">' + APP.fmt.entier(i.v) + '</b></li>';
    }).join('') + '</ul>';
  };

  /** Une ligne de rappel : client, ville, téléphone, retard, bouton d'ouverture. */
  U.ligneRappel = function (r, avecBouton) {
    var f = r.fiche, aujourdhui = H.aujourdhui(), ret = H.joursEntre(r.date, aujourdhui);
    var quand = r.date > aujourdhui ? 'le ' + H.jolieDate(r.date) : ret === 0 ? 'aujourd\'hui' : 'en retard de ' + ret + ' jour' + (ret > 1 ? 's' : '');
    return '<li class="rappel' + (ret > 0 ? ' en-retard' : '') + '"><div class="rappel-corps"><b>' + esc(f['Raison sociale / Nom']) + '</b><span>' + esc(f.Ville || '') + (f['Téléphone 1'] ? ' · <a href="tel:' + esc(APP.tel(f['Téléphone 1'])) + '">' + esc(f['Téléphone 1']) + '</a>' : '') + '</span>' +
      '<small>' + esc(quand) + (f.traite_par ? ' · noté par ' + esc(f.traite_par) : '') + '</small>' + (f.note ? '<small class="note-ligne">' + esc(f.note) + '</small>' : '') + '</div>' +
      (avecBouton ? '<button type="button" class="btn btn--ghost btn--s" data-ouvrir="' + esc(f._code) + '">Ouvrir' + icon('droite') + '</button>' : '') + '</li>';
  };
  /** Ouvre une fiche client dans l'écran Appels (accès direct, hors filtres). */
  APP.ouvrirFiche = function (code) { APP.aller('appels', { saut: String(code), ouvrir: true }); };
  APP.ouvrirPoint = function (code) { APP.aller('livraisons', { code: String(code), ouvrir: true }); };
})();
