/* Cockpit appels · écran Livraisons : vérification des points de livraison (référent sur place) rattachés aux clients. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui;
  var V = APP.vues.livraisons = { pret: false };
  var E = { statuts: ['À vérifier'], qui: [], qAdr: '', qMere: '', file: [], code: '', affiche: null, idx: 0, sale: false, occupe: false, majAffichee: '' };

  function fusionner(a) {
    var s = D.suiviAdr.get(a['Code adresse']) || {};
    return { a: a, code: a['Code adresse'], referent: s.referent || '', tel_site: s.tel_site || '', statut_adr: s.statut_adr || 'À vérifier', note_adr: s.note_adr || '', traite_par: s.traite_par || '', maj_le: s.maj_le || '' };
  }
  function calculer() {
    var tout = D.adresses.map(fusionner), q = E.qAdr.trim().toUpperCase(), m = E.qMere.trim().toUpperCase();
    if (q) return tout.filter(function (x) { return x.code.toUpperCase() === q; });
    if (m) return tout.filter(function (x) { return String(x.a['Code client mère']).toUpperCase() === m; });
    var traitants = D.traitants();
    return tout.filter(function (x) {
      if (E.statuts.length && E.statuts.indexOf(x.statut_adr) < 0) return false;
      if (E.qui.length) { var nt = E.qui.indexOf('Non vérifié') >= 0 && !x.traite_par.trim(); var ok = traitants.some(function (n) { return E.qui.indexOf('Vérifié par ' + n) >= 0 && x.traite_par === n; }); if (!nt && !ok) return false; }
      return true;
    });
  }
  function position() { for (var i = 0; i < E.file.length; i++) if (E.file[i].code === E.code) return i; return -1; }

  function squelette() {
    var p = $('#p-livraisons');
    p.innerHTML = U.titre('Livraisons', 'Prolongement de l\'appel : pour chaque site livré, qui est le référent sur place ?') +
      '<div id="l-tuiles" class="tuiles tuiles--3"></div>' +
      '<div class="barre-file verre" id="l-barre"><div class="nav-fiche"><button class="icone-btn" type="button" data-nav="-1" aria-label="Point précédent">' + icon('gauche') + '</button><div class="pos"><b class="num" id="l-pos">–</b><span id="l-tot"></span></div><button class="icone-btn" type="button" data-nav="1" aria-label="Point suivant">' + icon('droite') + '</button></div>' +
      '<label class="recherche">' + icon('loupe') + '<input class="saisie" id="l-adr" type="search" placeholder="Code adresse exact, par exemple 12771L56" aria-label="Code adresse exact" autocomplete="off"></label>' +
      '<label class="recherche">' + icon('building') + '<input class="saisie" id="l-mere" type="search" placeholder="Code client mère : tous ses points" aria-label="Code client mère" autocomplete="off"></label></div>' +
      '<div id="l-filtres" class="filtres-ligne"></div><div id="l-zone" class="appels-zone"></div>';
    var rafraichir = APP.debounce(function () { E.qAdr = $('#l-adr').value; E.qMere = $('#l-mere').value; V.majFile(); filtres(); }, 250);
    $('#l-adr', p).addEventListener('input', rafraichir); $('#l-mere', p).addEventListener('input', rafraichir);
    p.addEventListener('click', clic); p.addEventListener('input', saisie); p.addEventListener('change', saisie);
    p.addEventListener('submit', function (e) { if (e.target.id === 'l-form') { e.preventDefault(); enregistrer(); } });
    p.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('#l-form')) { e.preventDefault(); enregistrer(); } });
  }
  function tuiles() {
    var tout = D.adresses.length, ok = 0; D.suiviAdr.forEach(function (s) { if (s.statut_adr === 'Vérifié ✅' && D.adrParCode.has(s.code_adresse)) ok++; });
    $('#l-tuiles').innerHTML = U.tuile('Points de livraison', '', '', { nombre: tout }) + U.tuile('Vérifiés', '', tout ? APP.fmt.pct(ok / tout * 100, 1) + ' du total' : '', { nombre: ok, ton: 'vedette' }) + U.tuile('Restants', '', '', { nombre: tout - ok });
  }
  function filtres() {
    var z = $('#l-filtres');
    if (E.qAdr.trim() || E.qMere.trim()) { z.innerHTML = '<p class="aide">Recherche par code : les filtres de statut ne s\'appliquent pas.</p>'; return; }
    var qui = ['Non vérifié'].concat(D.traitants().map(function (n) { return 'Vérifié par ' + n; }));
    z.innerHTML = '<div class="groupe-filtre"><span class="etiquette">Statut</span>' + U.pastilles(H.STATUTS_ADRESSE.map(function (s) { return { v: s, l: H.libelle(s) }; }), E.statuts, 'data-l-statut') + '</div>' +
      '<div class="groupe-filtre"><span class="etiquette">Traitement</span>' + U.pastilles(qui.map(function (x) { return { v: x, l: x }; }), E.qui, 'data-l-qui') + '</div>';
  }

  V.majFile = function (garder) {
    E.file = calculer(); var pos = position();
    if (pos < 0 && !(E.code && (E.sale || garder === 'garder'))) { var c = E.file.length ? E.file[Math.min(E.idx, E.file.length - 1)] : null; E.code = c ? c.code : ''; }
    pos = position(); if (pos >= 0) E.idx = pos;
    var n = E.file.length;
    $('#l-pos').textContent = pos >= 0 ? pos + 1 : '–'; $('#l-tot').textContent = ' / ' + APP.fmt.entier(n);
    $('[data-nav="-1"]', $('#l-barre')).disabled = !(n && pos > 0); $('[data-nav="1"]', $('#l-barre')).disabled = !(n && pos < n - 1);
    tuiles();
    if (E.code !== E.affiche) afficher(); else verrou();
  };
  function verrou() {
    var z = $('#l-verrou'); if (!z || !E.code) return;
    var h = D.autresSur('adresse', E.code).map(function (a) { return '<div class="msg msg--warn">' + icon('users') + '<div><b>' + esc(a.nom) + '</b> consulte ce point de livraison ' + (a.minutes < 1 ? 'à l\'instant' : 'depuis ' + a.minutes + ' min') + '.</div></div>'; }).join('');
    var x = E.file.filter(function (r) { return r.code === E.code; })[0] || (D.adrParCode.get(E.code) && fusionner(D.adrParCode.get(E.code)));
    if (x && E.affiche === E.code && x.maj_le !== E.majAffichee) { if (!E.sale) { afficher(); return; } h += '<div class="msg msg--warn">' + icon('refresh') + '<div>Ce point vient d\'être modifié par quelqu\'un d\'autre. Vos saisies sont conservées ; enregistrer remplacera ces changements.</div></div>'; }
    if (z.innerHTML !== h) z.innerHTML = h;
  }

  function afficher() {
    var z = $('#l-zone'), a = E.code ? D.adrParCode.get(E.code) : null;
    E.affiche = E.code; E.sale = false;
    if (!a) { z.innerHTML = '<div class="verre carte-vide">' + U.vide('Aucun point de livraison à afficher', 'Aucun point ne correspond à ce filtre ou à cette recherche.', 'check') + '</div>'; return; }
    var x = fusionner(a); E.majAffichee = x.maj_le; D.presence('adresse', x.code);
    var adresse = [a['Adresse 1'], a['Adresse 2'], a['Adresse 3']].filter(Boolean).join(', '), ville = [a['Code postal'], a.Ville].filter(Boolean).join(' '), mere = D.baseParCode.get(String(a['Code client mère']));
    var tel = a['Téléphone'] ? '<a href="tel:' + esc(APP.tel(a['Téléphone'])) + '">' + esc(a['Téléphone']) + '</a>' : '<span class="aide">Aucun numéro</span>';
    z.innerHTML = '<div class="appels-grille' + (APP.reduit() ? '' : ' entre') + '"><div class="colonne-fiche"><div id="l-verrou" class="msgs"></div><article class="fiche verre"><header class="fiche-tete"><div><h2>' + esc(a['Nom site'] || 'Point de livraison') + '</h2><div class="tags">' + U.personne(x.traite_par) + U.tag('Adresse ' + x.code, 'marque') + '</div>' +
      (x.maj_le ? '<span class="aide">Dernière mise à jour : ' + esc(H.heureParis(x.maj_le, true)) + '</span>' : '') + '</div><span class="statut-pastille statut--' + (x.statut_adr === 'Vérifié ✅' ? 'fait' : x.statut_adr === 'Adresse obsolète' ? 'termine' : 'appeler') + '">' + esc(H.libelle(x.statut_adr)) + '</span></header>' +
      '<div class="coords"><div class="coord"><span class="coord-ico">' + icon('pin') + '</span><div><small>Adresse</small>' + (adresse ? '<span>' + esc(adresse) + '</span>' : '') + (ville ? '<span>' + esc(ville) + '</span>' : '') + '</div></div>' +
      '<div class="coord"><span class="coord-ico">' + icon('phone') + '</span><div><small>Téléphone</small>' + tel + '</div></div>' +
      '<div class="coord"><span class="coord-ico">' + icon('building') + '</span><div><small>Client mère</small><span>' + (mere ? esc(mere['Raison sociale / Nom']) : '') + '</span><span class="aide">Code ' + esc(a['Code client mère']) + '</span></div></div></div>' +
      (mere ? '<div class="actions"><button type="button" class="btn btn--ghost btn--s" data-client="' + esc(mere._code) + '">' + icon('phone') + 'Ouvrir la fiche du client</button></div>' : '') + '</article></div>' +
      '<div class="colonne-form"><form class="formulaire verre" id="l-form" novalidate autocomplete="off"><h2>Référent du site</h2>' +
      '<div class="champ"><label for="l-ref">Nom du référent sur place</label><input class="saisie" id="l-ref" value="' + esc(x.referent) + '"></div>' +
      '<div class="champ"><label for="l-tel">Téléphone du site ou du référent</label><input class="saisie" id="l-tel" type="tel" inputmode="tel" value="' + esc(x.tel_site) + '"></div>' +
      '<div class="champ"><span class="lbl">Statut</span>' + U.pastilles(H.STATUTS_ADRESSE.map(function (s) { return { v: s, l: H.libelle(s) }; }), [x.statut_adr], 'data-l-st', { classe: 'pastilles--statut' }) + '</div>' +
      '<div class="champ"><label for="l-note">Note</label><textarea class="saisie" id="l-note" rows="3">' + esc(x.note_adr) + '</textarea></div>' +
      '<details class="options"><summary>' + icon('trash') + '<span>Effacer volontairement un champ</span></summary><div class="options-corps"><p class="aide">Un champ laissé vide ne remplace jamais une information déjà enregistrée.</p>' + U.pastilles(Object.keys(H.CHAMPS_EFFACABLES_ADR).map(function (k) { return { v: k, l: k }; }), [], 'data-l-eff') + '</div></details>' +
      '<div class="msgs" id="l-erreurs" aria-live="polite"></div><div class="actions-form"><button class="btn btn--main btn--grand" type="submit" id="l-envoyer">Enregistrer et passer au suivant</button><span class="aide raccourci">Ctrl + Entrée</span></div></form></div></div>';
    verrou();
    if (!APP.reduit()) setTimeout(function () { var g = $('.appels-grille', z); if (g) g.classList.remove('entre'); }, 520);
  }

  function naviguer(pas) {
    var pos = position(), n = E.file.length; if (!n) return; var c = pos < 0 ? Math.min(n - 1, E.idx) : pos + pas; if (c < 0 || c > n - 1) return;
    var go = function () { E.sale = false; E.code = E.file[c].code; V.majFile('garder'); };
    if (!E.sale) return go();
    APP.confirmer({ titre: 'Modifications non enregistrées', texte: 'Les saisies de ce point de livraison ne sont pas enregistrées. Les abandonner ?', ok: 'Abandonner', non: 'Rester', danger: true }).then(function (ok) { if (ok) go(); });
  }
  function enregistrer() {
    if (E.occupe || !E.affiche) return;
    var statut = ($('[data-l-st][aria-pressed="true"]') || { getAttribute: function () { return 'À vérifier'; } }).getAttribute('data-l-st');
    var efface = $$('[data-l-eff][aria-pressed="true"]').map(function (b) { return H.CHAMPS_EFFACABLES_ADR[b.getAttribute('data-l-eff')]; });
    var pos = position(), suivant = pos >= 0 ? ((E.file[pos + 1] || E.file[pos - 1] || {}).code || '') : '', code = E.affiche, btn = $('#l-envoyer');
    E.occupe = true; APP.occupe(btn, 'Enregistrement…');
    D.enregistrerAdresse(code, { referent: $('#l-ref').value.trim(), tel_site: $('#l-tel').value.trim(), statut_adr: statut, note_adr: $('#l-note').value.trim() }, efface).then(function (r) {
      E.occupe = false; E.sale = false; APP.libere(btn); APP.toast('Point de livraison enregistré : ' + H.libelle(r.statut_adr) + '.');
      E.code = suivant && suivant !== code ? suivant : code; V.majFile(suivant && suivant !== code ? undefined : 'garder'); if (!suivant || suivant === code) { E.affiche = null; afficher(); }
    }, function (e) { E.occupe = false; APP.libere(btn); $('#l-erreurs').innerHTML = APP.message('err', 'Enregistrement impossible : ' + esc(e.message) + ' Vos champs restent affichés : réessayez dans quelques secondes.'); });
  }
  function clic(e) {
    var b;
    if ((b = e.target.closest('[data-nav]'))) return naviguer(+b.dataset.nav);
    if ((b = e.target.closest('[data-client]'))) return APP.ouvrirFiche(b.dataset.client);
    if ((b = e.target.closest('[data-l-statut],[data-l-qui]'))) {
      var liste = b.hasAttribute('data-l-statut') ? E.statuts : E.qui, v = b.getAttribute(b.hasAttribute('data-l-statut') ? 'data-l-statut' : 'data-l-qui'), i = liste.indexOf(v);
      if (i < 0) liste.push(v); else liste.splice(i, 1); b.setAttribute('aria-pressed', String(i < 0)); E.code = ''; V.majFile(); return;
    }
    if ((b = e.target.closest('[data-l-st]'))) { $$('[data-l-st]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); E.sale = true; return; }
    if ((b = e.target.closest('[data-l-eff]'))) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); E.sale = true; }
  }
  function saisie(e) { var t = e.target; if (t.closest && t.closest('#l-form')) { E.sale = true; if (t.tagName === 'TEXTAREA') { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 280) + 'px'; } } }

  V.codeAffiche = function () { return E.affiche || ''; };
  V.rendre = function () { if (!V.construit) { squelette(); V.construit = true; } E.affiche = null; filtres(); V.majFile(); };
  V.actualiser = function () { if (!V.construit) return V.rendre(); V.majFile('garder'); filtres(); };
  V.ouvrir = function (opts) {
    opts = opts || {};
    if (opts.code) { $('#l-adr').value = opts.code; E.qAdr = opts.code; E.qMere = ''; $('#l-mere').value = ''; E.code = ''; filtres(); V.majFile(); }
    APP.placerSegments();
  };
})();
