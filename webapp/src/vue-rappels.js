/* Cockpit appels · écran Rappels : calendrier mensuel de la charge à venir et liste des clients à rappeler, jour par jour. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var V = APP.vues.rappels = { pret: false };
  var E = { vue: 'moi', qui: '', a: 0, m: 0, sel: '', sens: 0 };

  function debut() { var t = H.aujourdhui(); E.a = +t.slice(0, 4); E.m = +t.slice(5, 7) - 1; if (!E.init) { E.init = true; E.vue = D.estRole('manager') ? 'equipe' : 'moi'; } }
  function donnees() { var p = E.vue === 'moi' ? D.moi.nom : (E.qui || null); return D.rappelsPlanifies(p); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function grille(rappels) {
    var aujourdhui = H.aujourdhui(), premier = E.a + '-' + pad(E.m + 1) + '-01', dernier = H.ajouterJours(E.m === 11 ? (E.a + 1) + '-01-01' : E.a + '-' + pad(E.m + 2) + '-01', -1);
    var debutGrille = H.ajouterJours(premier, -H.jourSemaine(premier)), par = {};
    rappels.forEach(function (r) { (par[r.date] = par[r.date] || []).push(r); });
    var cases = '', j = debutGrille, n = 0;
    while ((j <= dernier || H.jourSemaine(j) !== 0) && n < 42) {
      var liste = par[j] || [], nb = liste.length, hors = j < premier || j > dernier, cl = H.classeCharge(nb, j, aujourdhui);
      var pts = '', vus = {}; liste.forEach(function (r) { var q = r.fiche.traite_par || ''; if (vus[q]) return; vus[q] = 1; pts += '<i style="background:' + (q ? D.couleur(q) : 'var(--p3)') + '" title="' + esc(q || 'Non attribué') + '"></i>'; });
      cases += '<button type="button" class="cal-case cal-case--' + cl + (hors ? ' hors' : '') + (j === aujourdhui ? ' aujourdhui' : '') + (j === E.sel ? ' choisi' : '') + '" data-jour="' + j + '" aria-label="' + esc(APP.fmt.jour(j)) + ' : ' + nb + ' rappel' + (nb > 1 ? 's' : '') + '" aria-pressed="' + (j === E.sel) + '"><b class="d">' + +j.slice(8, 10) + '</b><span class="n">' + (nb || '') + '</span><span class="pts">' + pts + '</span></button>';
      j = H.ajouterJours(j, 1); n++;
    }
    return '<div class="cal-semaine">' + H.JOURS_SEMAINE.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div><div class="cal-grille' + (E.sens ? ' glisse-' + (E.sens > 0 ? 'suiv' : 'prec') : '') + '">' + cases + '</div>';
  }
  function detail(rappels) {
    var aujourdhui = H.aujourdhui(), liste, titre;
    if (E.sel === 'retard') { liste = rappels.filter(function (r) { return r.date < aujourdhui; }); titre = 'Rappels en retard'; }
    else if (E.sel) { liste = rappels.filter(function (r) { return r.date === E.sel; }); titre = APP.fmt.jour(E.sel).replace(/^./, function (c) { return c.toUpperCase(); }); }
    else return U.carte('Détail', U.vide('Choisissez un jour', 'Cliquez sur une date du calendrier pour voir les clients à rappeler.', 'calendar'), { classe: 'c-detail' });
    var perso = D.peutTraiter(), repartition = D.commerciales().concat(D.admins()).map(function (nom) { var n = liste.filter(function (r) { return r.fiche.traite_par === nom; }).length; return n ? U.personne(nom) + '<b class="num">' + n + '</b>' : ''; }).join('');
    var corps = liste.length ? '<p class="aide">' + liste.length + ' client' + (liste.length > 1 ? 's' : '') + ' à rappeler' + (E.sel !== 'retard' && E.sel < aujourdhui ? ' · date dépassée' : '') + '.</p>' + (repartition ? '<div class="repartition">' + repartition + '</div>' : '') +
      '<ul class="rappels">' + liste.map(function (r) { return U.ligneRappel(r, perso); }).join('') + '</ul>' +
      (perso && liste.some(function (r) { return r.fiche.traite_par === D.moi.nom; }) ? '<div class="actions"><button type="button" class="btn btn--main" data-traiter>' + icon('phone') + 'Traiter ces rappels</button></div>' : '')
      : U.vide('Aucun rappel', 'Aucun client à rappeler ' + (E.sel === 'retard' ? 'en retard.' : 'ce jour-là.'), 'check');
    return U.carte(titre, corps, { classe: 'c-detail' });
  }

  V.rendre = function () {
    if (!E.a) debut();
    var p = $('#p-rappels'), rappels = donnees(), aujourdhui = H.aujourdhui();
    var retard = rappels.filter(function (r) { return r.date < aujourdhui; }).length, mois = E.a + '-' + pad(E.m + 1), duMois = rappels.filter(function (r) { return r.date.slice(0, 7) === mois; }).length;
    var vues = D.peutPiloter() ? U.segment([{ v: 'moi', l: D.peutTraiter() ? 'Mes rappels' : 'Équipe' }, { v: 'equipe', l: 'Équipe' }].filter(function (x, i) { return D.peutTraiter() || i === 1; }), E.vue, 'data-vue') : '';
    var qui = E.vue === 'equipe' && D.peutPiloter() ? '<div class="pastilles">' + [{ v: '', l: 'Toute l\'équipe' }].concat(D.commerciales().concat(D.admins()).map(function (n) { return { v: n, l: n }; })).map(function (x) { return '<button type="button" class="pastille" data-qui="' + esc(x.v) + '" aria-pressed="' + (E.qui === x.v) + '">' + esc(x.l) + '</button>'; }).join('') + '</div>' : '';
    var legende = '<div class="legende">' + D.commerciales().concat(D.admins()).map(function (n) { return '<span><i class="pt" style="background:' + D.couleur(n) + '"></i>' + esc(n) + '</span>'; }).join('') + '<span class="aide">Une case rouge signale des rappels dont la date est dépassée.</span></div>';
    p.innerHTML = U.titre('Rappels', 'La charge à venir, jour par jour. Les dates viennent des fiches enregistrées avec le statut « À rappeler ».', vues) + (qui ? '<div class="filtres-ligne">' + qui + '</div>' : '') +
      '<div class="rappels-grille"><section class="carte verre c-calendrier"><div class="cal-tete"><button class="icone-btn" type="button" data-mois="-1" aria-label="Mois précédent">' + icon('gauche') + '</button><h2 aria-live="polite">' + H.MOIS[E.m] + ' ' + E.a + '</h2><button class="icone-btn" type="button" data-mois="1" aria-label="Mois suivant">' + icon('droite') + '</button></div>' +
      '<div class="cal-actions"><button type="button" class="btn btn--ghost btn--s" data-auj>Aujourd\'hui</button>' + (retard ? '<button type="button" class="btn btn--ghost btn--s alerte" data-retard>' + icon('alert') + retard + ' en retard</button>' : '') + '<span class="aide">' + (duMois ? duMois + ' rappel' + (duMois > 1 ? 's' : '') + ' programmé' + (duMois > 1 ? 's' : '') + ' sur ce mois.' : 'Aucun rappel programmé sur ce mois.') + '</span></div>' +
      grille(rappels) + legende + '</section>' + '<div class="rappels-detail">' + detail(rappels) + '</div></div>';
    if (E.vue && D.peutPiloter()) { var seg = $('.seg', p); if (seg) APP.glisse(seg); }
    E.sens = 0;
  };
  V.actualiser = function () { V.rendre(); };
  V.ouvrir = function (opts) {
    opts = opts || {};
    if (!V.lie) { V.lie = true; var p = $('#p-rappels');
      p.addEventListener('click', function (e) {
        var b;
        if ((b = e.target.closest('[data-mois]'))) { var d = +b.dataset.mois; E.m += d; if (E.m < 0) { E.m = 11; E.a--; } if (E.m > 11) { E.m = 0; E.a++; } E.sens = d; return V.rendre(); }
        if (e.target.closest('[data-auj]')) { debut(); E.sel = H.aujourdhui(); return V.rendre(); }
        if (e.target.closest('[data-retard]')) { E.sel = 'retard'; return V.rendre(); }
        if ((b = e.target.closest('[data-jour]'))) { E.sel = b.dataset.jour; if (b.classList.contains('hors')) { E.a = +E.sel.slice(0, 4); E.m = +E.sel.slice(5, 7) - 1; } return V.rendre(); }
        if ((b = e.target.closest('[data-ouvrir]'))) return APP.ouvrirFiche(b.dataset.ouvrir);
        if (e.target.closest('[data-traiter]')) return APP.aller('appels', { jour: E.sel, ouvrir: true });
        if ((b = e.target.closest('[data-vue]'))) { E.vue = b.dataset.v; E.sel = ''; return V.rendre(); }
        if ((b = e.target.closest('[data-qui]'))) { E.qui = b.dataset.qui; return V.rendre(); }
      }); }
    if (!E.a) debut();
    if (!D.peutTraiter()) E.vue = 'equipe'; else if (D.estRole('commercial')) E.vue = 'moi';
    if (opts.jour) { E.sel = opts.jour; if (opts.jour !== 'retard') { E.a = +opts.jour.slice(0, 4); E.m = +opts.jour.slice(5, 7) - 1; } if (V.pret) V.rendre(); }
  };
})();
