/* Cockpit appels · écran Rappels : calendrier mensuel de la charge à venir et liste des clients à rappeler, jour par jour. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var V = APP.vues.rappels = { pret: false };
  var E = { vue: 'moi', qui: '', a: 0, m: 0, sel: '', sens: 0, coches: {}, cleCoches: '' };

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
    var perso = D.peutTraiter(), lot = selectionDe(liste), repartition = D.commerciales().concat(D.admins()).map(function (nom) { var n = liste.filter(function (r) { return r.fiche.traite_par === nom; }).length; return n ? U.personne(nom) + '<b class="num">' + n + '</b>' : ''; }).join('');
    var corps = liste.length ? '<p class="aide">' + liste.length + ' client' + (liste.length > 1 ? 's' : '') + ' à rappeler' + (E.sel !== 'retard' && E.sel < aujourdhui ? ' · date dépassée' : '') + '.</p>' + (repartition ? '<div class="repartition">' + repartition + '</div>' : '') +
      barreLot(lot) +
      '<ul class="rappels">' + liste.map(function (r) { return U.ligneRappel(r, perso, modifiable(r) ? { coche: !!E.coches[r.fiche._code] } : null); }).join('') + '</ul>' +
      (perso && liste.some(function (r) { return r.fiche.traite_par === D.moi.nom; }) ? '<div class="actions"><button type="button" class="btn btn--main" data-traiter>' + icon('phone') + 'Traiter ces rappels</button></div>' : '')
      : U.vide('Aucun rappel', 'Aucun client à rappeler ' + (E.sel === 'retard' ? 'en retard.' : 'ce jour-là.'), 'check');
    return U.carte(titre, corps, { classe: 'c-detail' });
  }


  /* ----- reprogrammation en lot : commerciale = ses propres rappels, admin = tous les comptes (règle appliquée par la base, sql/18) ----- */
  function modifiable(r) { return D.estRole('admin') || (D.estRole('commercial') && r.fiche.traite_par === D.moi.nom); }
  /** Rappels modifiables de la liste affichée ; oublie les cases cochées qui n'y sont plus (changement de jour, de vue, actualisation). */
  function selectionDe(liste) {
    var cle = E.sel + '|' + E.vue + '|' + E.qui;
    if (cle !== E.cleCoches) { E.coches = {}; E.cleCoches = cle; }
    var mod = liste.filter(modifiable), garde = {};
    mod.forEach(function (r) { if (E.coches[r.fiche._code]) garde[r.fiche._code] = true; });
    E.coches = garde;
    return mod;
  }
  function basculer(code, etat) {
    var v = etat === undefined ? !E.coches[code] : etat, n = {};
    Object.keys(E.coches).forEach(function (c) { if (c !== code) n[c] = true; });
    if (v) n[code] = true;
    E.coches = n;
  }
  function cochees(lot) { return lot.filter(function (r) { return E.coches[r.fiche._code]; }); }
  function libelleLot(n, total) { return n ? n + ' sélectionné' + (n > 1 ? 's' : '') + ' sur ' + total : 'Aucun rappel sélectionné'; }
  function barreLot(lot) {
    if (!lot.length) return '';
    var n = cochees(lot).length;
    return '<div class="lot" data-lot><label class="case"><input type="checkbox" data-tout' + (n === lot.length ? ' checked' : '') + '><span>Tout sélectionner (' + lot.length + ')</span></label>' +
      '<span class="aide" data-lot-compte aria-live="polite">' + libelleLot(n, lot.length) + '</span>' +
      '<button type="button" class="btn btn--main btn--s" data-reprog' + (n ? '' : ' disabled') + '>' + icon('calendar') + 'Reprogrammer</button></div>';
  }
  /** Met à jour la barre et les cases sans redessiner l'écran (garde le défilement de la liste). */
  function majLot() {
    var p = $('#p-rappels'), tout = $('[data-tout]', p);
    if (!tout) return;
    var lot = selectionDe(listeAffichee(donnees())), n = cochees(lot).length;
    tout.checked = n === lot.length && n > 0; tout.indeterminate = n > 0 && n < lot.length;
    $('[data-lot-compte]', p).textContent = libelleLot(n, lot.length);
    $('[data-reprog]', p).disabled = !n;
    $$('[data-coche]', p).forEach(function (c) { c.checked = !!E.coches[c.dataset.coche]; c.closest('.rappel').classList.toggle('coche', c.checked); });
  }
  function listeAffichee(rappels) {
    var aujourdhui = H.aujourdhui();
    if (E.sel === 'retard') return rappels.filter(function (r) { return r.date < aujourdhui; });
    return E.sel ? rappels.filter(function (r) { return r.date === E.sel; }) : [];
  }
  function jourOuvre(iso) { while (H.jourSemaine(iso) > 4) iso = H.ajouterJours(iso, 1); return iso; }
  function joliJour(iso) { return APP.fmt.jour(iso).replace(/^./, function (c) { return c.toUpperCase(); }); }

  function ouvrirReprogrammation() {
    var lot = cochees(selectionDe(listeAffichee(donnees())));
    if (!lot.length) return;
    var aujourdhui = H.aujourdhui(), de = E.sel, base = de !== 'retard' && de >= aujourdhui ? de : H.ajouterJours(aujourdhui, -1);
    var defaut = jourOuvre(H.ajouterJours(base, 1)), max = H.ajouterJours(aujourdhui, 730);
    var lundi = H.ajouterJours(aujourdhui, 7 - H.jourSemaine(aujourdhui));
    var raccourcis = [{ v: H.ajouterJours(aujourdhui, 1), l: 'Demain' }, { v: lundi, l: 'Lundi prochain' }, { v: H.ajouterJours(base < aujourdhui ? aujourdhui : base, 7), l: 'Une semaine plus tard' }]
      .filter(function (x, i, t) { return x.v !== de && t.findIndex(function (y) { return y.v === x.v; }) === i; });
    var parPersonne = {}; lot.forEach(function (r) { var q = r.fiche.traite_par || ''; parPersonne[q] = (parPersonne[q] || 0) + 1; });
    var personnes = Object.keys(parPersonne), autres = personnes.filter(function (q) { return q !== D.moi.nom; });
    var n = lot.length, s = n > 1 ? 's' : '';
    var origine = de === 'retard' ? 'en retard' : 'du ' + APP.fmt.jour(de);
    var f = APP.fenetre('<div class="modale verre"><h2>Reprogrammer ' + n + ' rappel' + s + '</h2>' +
      '<p class="aide">Rappel' + s + ' ' + esc(origine) + '. Seule la date change : la fiche, son statut, ses notes et la personne qui la suit restent identiques.</p>' +
      (autres.length ? '<div class="repartition">' + personnes.map(function (q) { return U.personne(q) + '<b class="num">' + parPersonne[q] + '</b>'; }).join('') + '</div>' +
        '<p class="aide">Vous déplacez des rappels suivis par ' + esc(autres.map(function (q) { return q || 'personne'; }).join(', ')) + ' : l\'opération sera tracée dans l\'historique des actions du portail.</p>' : '') +
      '<div class="champ"><label for="rp-date">Nouvelle date</label><input class="saisie" id="rp-date" type="date" min="' + aujourdhui + '" max="' + max + '" value="' + defaut + '" required></div>' +
      '<div class="pastilles" role="group" aria-label="Raccourcis de date">' + raccourcis.map(function (x) { return '<button type="button" class="pastille" data-rp="' + x.v + '">' + esc(x.l) + '</button>'; }).join('') + '</div>' +
      '<p class="aide" id="rp-info" aria-live="polite"></p>' +
      '<div class="actions"><button type="button" class="btn btn--main" data-ok>' + icon('calendar') + 'Reprogrammer</button><button type="button" class="btn btn--ghost" data-non>Annuler</button></div></div>');
    var champ = $('#rp-date', f.el), info = $('#rp-info', f.el), ok = $('[data-ok]', f.el), envoi = false;
    function majInfo() {
      var v = champ.value, valide = H.estIso(v) && v >= aujourdhui && v <= max && v !== de;
      ok.disabled = !valide || envoi;
      $$('[data-rp]', f.el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rp === v)); });
      if (!H.estIso(v)) { info.textContent = 'Choisissez une date.'; return; }
      if (v < aujourdhui) { info.textContent = 'La date ne peut pas être dans le passé.'; return; }
      if (v > max) { info.textContent = 'Deux ans au maximum.'; return; }
      if (v === de) { info.textContent = 'C\'est déjà la date de ces rappels.'; return; }
      // charge déjà prévue ce jour-là pour les mêmes personnes : évite de créer une journée ingérable
      var deja = D.rappelsPlanifies(null).filter(function (r) { return r.date === v && parPersonne[r.fiche.traite_par || ''] !== undefined; }).length;
      info.innerHTML = '<b>' + esc(joliJour(v)) + '</b> · ' + (deja ? deja + ' rappel' + (deja > 1 ? 's' : '') + ' déjà prévu' + (deja > 1 ? 's' : '') + ', ' + (deja + n) + ' après le déplacement.' : 'aucun rappel encore prévu ce jour-là.') +
        (H.jourSemaine(v) > 4 ? ' <span class="alerte-texte" style="display:inline">Attention : c\'est un week-end.</span>' : '');
    }
    champ.addEventListener('input', majInfo); champ.addEventListener('change', majInfo);
    f.el.addEventListener('click', function (e) { var b = e.target.closest('[data-rp]'); if (b) { champ.value = b.dataset.rp; majInfo(); } });
    $('[data-non]', f.el).addEventListener('click', function () { f.fermer(); });
    ok.addEventListener('click', function () {
      var vers = champ.value; if (ok.disabled) return;
      envoi = true; APP.occupe(ok, 'Reprogrammation…');
      D.reprogrammerRappels(lot.map(function (r) { return r.fiche._code; }), de, vers).then(function (r) {
        f.fermer(); E.coches = {};
        if (r.faits) APP.toast(r.faits + ' rappel' + (r.faits > 1 ? 's' : '') + ' reprogrammé' + (r.faits > 1 ? 's' : '') + ' au ' + APP.fmt.jour(vers) + '.');
        if (r.ignores.length) APP.toast(r.ignores.length + ' rappel' + (r.ignores.length > 1 ? 's n\'ont' : ' n\'a') + ' pas été déplacé' + (r.ignores.length > 1 ? 's' : '') + ' : la fiche a été modifiée entre-temps ou ne vous est pas attribuée.', 'err');
        V.rendre();
      }, function (e) { envoi = false; APP.libere(ok); majInfo(); APP.toast(e.message || 'Reprogrammation impossible.', 'err'); });
    });
    majInfo(); setTimeout(function () { champ.focus(); }, 30);
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
    majLot();
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
        if (e.target.closest('[data-reprog]')) return ouvrirReprogrammation();
        // un clic sur le corps d'une ligne cochable (hors lien ou bouton) coche ou décoche la ligne : plus confortable au doigt
        if (!e.target.closest('a,input,button,label') && (b = e.target.closest('.rappel--case'))) { basculer($('[data-coche]', b).dataset.coche); return majLot(); }
        if (e.target.closest('[data-traiter]')) return APP.aller('appels', { jour: E.sel, ouvrir: true });
        if ((b = e.target.closest('[data-vue]'))) { E.vue = b.dataset.v; E.sel = ''; return V.rendre(); }
        if ((b = e.target.closest('[data-qui]'))) { E.qui = b.dataset.qui; return V.rendre(); }
      });
      p.addEventListener('change', function (e) {
        var c = e.target;
        if (c.matches('[data-coche]')) { basculer(c.dataset.coche, c.checked); return majLot(); }
        if (c.matches('[data-tout]')) { var lot = selectionDe(listeAffichee(donnees())); E.coches = {}; if (c.checked) lot.forEach(function (r) { E.coches[r.fiche._code] = true; }); return majLot(); }
      }); }
    if (!E.a) debut();
    if (!D.peutTraiter()) E.vue = 'equipe'; else if (D.estRole('commercial')) E.vue = 'moi';
    if (opts.jour) { E.sel = opts.jour; if (opts.jour !== 'retard') { E.a = +opts.jour.slice(0, 4); E.m = +opts.jour.slice(5, 7) - 1; } if (V.pret) V.rendre(); }
  };
})();
