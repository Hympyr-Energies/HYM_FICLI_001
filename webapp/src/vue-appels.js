/* Cockpit appels · écran Appels : file d'appel, fiche client, script d'appel, résultat de l'appel, administration de la fiche. */
(function () {
  'use strict';
  var APP = window.APP, H = APP.H, D = APP.D, $ = APP.$, $$ = APP.$$, esc = APP.esc, icon = APP.icon, U = APP.ui, SC = window.HYM_SCRIPTS;
  var V = APP.vues.appels = { pret: false };

  var DEF = { traitement: ['Non traité'], statuts: ['À appeler', 'À rappeler'], types: [], aCompleter: false, recherche: '', masquer: true, tri: true };
  var E = { f: Object.assign({}, DEF, { traitement: ['Non traité'], statuts: ['À appeler', 'À rappeler'], types: [] }), code: '', affiche: null, idx: 0, file: [], saut: '', jour: '', sale: false, majAffichee: '', scriptOuvert: false, scriptType: null, scriptVue: 'deroule', occupe: false };

  /* ------------------------------------------------------------------ file d'appel */
  function calculerFile() {
    if (E.saut) { var f = D.baseParCode.get(E.saut); return f ? [f] : []; }
    if (E.jour) {
      var aujourdhui = H.aujourdhui(), l = D.rappelsPlanifies(D.moi.nom);
      l = l.filter(function (r) { return E.jour === 'dus' ? r.date <= aujourdhui : E.jour === 'retard' ? r.date < aujourdhui : r.date === E.jour; });
      return l.map(function (r) { return r.fiche; });
    }
    return H.construireFile(D.base, Object.assign({}, E.f, { ouvertes: D.codesOuverts('client') }), D.traitants());
  }
  function position() { for (var i = 0; i < E.file.length; i++) if (E.file[i]._code === E.code) return i; return -1; }
  function enregistrerFiltres() { APP.prefMoi('filtres', E.f); }
  function chargerFiltres() {
    var p = APP.prefMoi('filtres');
    if (p && Array.isArray(p.traitement) && Array.isArray(p.statuts) && Array.isArray(p.types)) E.f = Object.assign({}, DEF, p, { recherche: '' });
    E.scriptOuvert = !!APP.prefMoi('script');
  }

  /* ------------------------------------------------------------------ squelette de l'écran (construit une fois) */
  function squelette() {
    var p = $('#p-appels');
    p.innerHTML = U.titre('Appels', 'Une fiche à la fois, dans l\'ordre de la file. Les filtres décident de ce qui s\'affiche.') +
      '<div class="barre-file verre" id="a-barre">' +
      '<div class="nav-fiche"><button class="icone-btn" type="button" data-nav="-1" aria-label="Fiche précédente" aria-keyshortcuts="Alt+ArrowLeft">' + icon('gauche') + '</button><div class="pos" aria-live="polite"><b class="num" id="a-pos">–</b><span id="a-tot"></span></div><button class="icone-btn" type="button" data-nav="1" aria-label="Fiche suivante" aria-keyshortcuts="Alt+ArrowRight">' + icon('droite') + '</button></div>' +
      '<label class="recherche">' + icon('loupe') + '<input class="saisie" id="a-rech" type="search" placeholder="Rechercher un nom, un code ou une ville" aria-label="Rechercher dans la file" autocomplete="off"></label>' +
      '<button class="btn btn--ghost" type="button" data-filtres>' + icon('filtre') + 'Filtres<span class="badge" id="a-badge" hidden></span></button>' +
      '<form class="acces-direct" id="a-direct" autocomplete="off"><input class="saisie" id="a-code" placeholder="Code client exact" aria-label="Accès direct par code client"><button class="btn btn--ghost btn--s" type="submit">Ouvrir</button></form></div>' +
      '<div id="a-chips" class="chips-actifs"></div><div id="a-infos"></div><div id="a-zone" class="appels-zone"></div>';
    var recherche = $('#a-rech', p);
    recherche.addEventListener('input', APP.debounce(function () { E.f.recherche = recherche.value.trim(); E.jour = ''; E.saut = ''; V.majFile(); }, 240));
    $('#a-direct', p).addEventListener('submit', function (e) {
      e.preventDefault(); var champ = $('#a-code', p), c = champ.value.trim().toUpperCase(); if (!c) return;
      var f = null; D.base.some(function (b) { if (b._code.toUpperCase() === c) { f = b; return true; } return false; });
      if (!f) { APP.toast('Aucun client avec le code « ' + champ.value.trim() + ' ».', 'err'); champ.setAttribute('aria-invalid', 'true'); return; }
      champ.setAttribute('aria-invalid', 'false'); champ.value = ''; confirmerSortie().then(function (ok) { if (ok) { E.saut = f._code; E.jour = ''; V.majFile(true); } });
    });
    p.addEventListener('click', clicEcran);
    p.addEventListener('input', saisieEcran);
    p.addEventListener('change', saisieEcran);
    p.addEventListener('submit', function (e) { if (e.target.id === 'a-form') { e.preventDefault(); enregistrer(); } else if (e.target.id === 'a-admin') { e.preventDefault(); appliquerAdmin(); } });
    p.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('#a-form')) { e.preventDefault(); enregistrer(); } });
  }
  document.addEventListener('keydown', function (e) {
    if (APP.ongletCourant() !== 'appels' || !e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); naviguer(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); naviguer(1); }
  });

  /* ------------------------------------------------------------------ mise à jour de la file et de ses indicateurs */
  V.majFile = function (conserver) {
    E.file = calculerFile();
    var pos = position();
    if (E.saut) E.code = E.saut;
    else if (pos < 0 && !(E.code && (E.sale || conserver === 'garder'))) {
      var cible = null;
      if (E.file.length) { cible = E.file[Math.min(E.idx, E.file.length - 1)]; if (!E.code && D.derniereFiche && !E.jour) E.file.some(function (r) { if (r._code === D.derniereFiche) { cible = r; return true; } return false; }); }
      E.code = cible ? cible._code : '';
    }
    pos = position(); if (pos >= 0) E.idx = pos;
    majBarre(); majChips(); majInfos();
    if (E.code !== E.affiche) afficherFiche(); else majVerrou();
  };
  function majBarre() {
    var pos = position(), n = E.file.length;
    $('#a-pos').textContent = pos >= 0 ? pos + 1 : '–'; $('#a-tot').textContent = ' / ' + APP.fmt.entier(n);
    var prec = $('[data-nav="-1"]'), suiv = $('[data-nav="1"]');
    prec.disabled = !(n && (pos > 0 || (pos < 0 && E.idx > 0))); suiv.disabled = !(n && (pos < n - 1));
    var actifs = (E.f.traitement.length ? 1 : 0) + (E.f.statuts.length ? 1 : 0) + (E.f.types.length ? 1 : 0) + (E.f.aCompleter ? 1 : 0);
    var b = $('#a-badge'); b.hidden = !actifs; b.textContent = actifs;
    $('[data-filtres]').disabled = !!(E.saut || E.jour);
  }
  function majChips() {
    var z = $('#a-chips'), c = [];
    if (E.saut || E.jour) { z.innerHTML = ''; return; }
    var chip = function (txt, cle, v) { c.push('<button type="button" class="tag tag--retirer" data-retirer="' + cle + '" data-v="' + esc(v === undefined ? '' : v) + '" aria-label="Retirer le filtre ' + esc(txt) + '">' + esc(txt) + icon('croix') + '</button>'); };
    E.f.traitement.forEach(function (t) { chip(t, 'traitement', t); });
    E.f.statuts.forEach(function (s) { chip(H.libelle(s), 'statuts', s); });
    E.f.types.forEach(function (t) { chip(t, 'types', t); });
    if (E.f.aCompleter) chip('À compléter', 'aCompleter');
    z.innerHTML = c.join('');
  }
  function majInfos() {
    var z = $('#a-infos'), h = '', aujourdhui = H.aujourdhui();
    if (E.saut || E.jour) {
      var txt = E.saut ? 'Fiche ouverte directement, hors filtres.' : E.jour === 'dus' ? 'File limitée à vos rappels dus (' + E.file.length + ' fiche' + (E.file.length > 1 ? 's' : '') + ').' : E.jour === 'retard' ? 'File limitée à vos rappels en retard (' + E.file.length + ' fiche' + (E.file.length > 1 ? 's' : '') + ').' : 'File limitée aux rappels du ' + H.jolieDate(E.jour) + ' (' + E.file.length + ' fiche' + (E.file.length > 1 ? 's' : '') + ').';
      h = '<div class="msg msg--info">' + icon('info') + '<div>' + esc(txt) + '</div><button class="btn btn--ghost btn--s" type="button" data-retour>' + icon('gauche') + 'Revenir à ma file</button></div>';
    } else {
      var dus = D.rappelsDus(D.moi.nom);
      if (dus.length) { var ret = dus.filter(function (r) { return r.date < aujourdhui; }).length; h = '<div class="msg msg--warn">' + icon('clock') + '<div><b>' + dus.length + ' client' + (dus.length > 1 ? 's' : '') + ' à rappeler aujourd\'hui</b>' + (ret ? ', dont ' + ret + ' en retard' : '') + '.</div><button class="btn btn--ghost btn--s" type="button" data-jour="dus">Traiter mes rappels</button></div>'; }
    }
    if (z.innerHTML !== h) z.innerHTML = h;
  }
  function majVerrou() {
    var z = $('#a-verrou'); if (!z || !E.code) return;
    var autres = D.autresSur('client', E.code), h = autres.map(function (a) { return '<div class="msg msg--warn">' + icon('users') + '<div><b>' + esc(a.nom) + '</b> consulte cette fiche ' + (a.minutes < 1 ? 'à l\'instant' : 'depuis ' + a.minutes + ' min') + '. Pour éviter d\'appeler deux fois le même client, passez à la suivante.</div></div>'; }).join('');
    var f = D.baseParCode.get(E.code);
    if (f && E.affiche === E.code && f.maj_le !== E.majAffichee) {
      if (!E.sale) { afficherFiche(); return; }
      h += '<div class="msg msg--warn">' + icon('refresh') + '<div>Cette fiche vient d\'être modifiée' + (f.traite_par ? ' par <b>' + esc(f.traite_par) + '</b>' : '') + '. Vos saisies en cours sont conservées ; enregistrer remplacera ces changements.</div></div>';
    }
    if (z.innerHTML !== h) z.innerHTML = h;
  }

  /* ------------------------------------------------------------------ navigation entre fiches */
  function confirmerSortie() {
    if (!E.sale) return Promise.resolve(true);
    return APP.confirmer({ titre: 'Modifications non enregistrées', texte: 'La fiche en cours contient des saisies qui n\'ont pas été enregistrées. Les abandonner ?', ok: 'Abandonner', non: 'Rester sur la fiche', danger: true });
  }
  function naviguer(pas) {
    var pos = position(), n = E.file.length; if (!n) return;
    var cible = pos < 0 ? Math.max(0, Math.min(n - 1, E.idx + (pas > 0 ? 0 : -1))) : pos + pas;
    if (cible < 0 || cible > n - 1) return;
    confirmerSortie().then(function (ok) { if (!ok) return; E.sale = false; E.code = E.file[cible]._code; majBarre(); afficherFiche(); });
  }
  function codeSuivant() {
    var pos = position(); if (pos < 0) return E.file.length ? E.file[Math.min(E.idx, E.file.length - 1)]._code : '';
    var s = E.file[pos + 1] || E.file[pos - 1]; return s ? s._code : '';
  }

  /* ------------------------------------------------------------------ fiche client */
  function coord(ico, titre, corps) { return corps ? '<div class="coord"><span class="coord-ico">' + icon(ico) + '</span><div><small>' + esc(titre) + '</small>' + corps + '</div></div>' : ''; }
  function htmlFiche(f) {
    var adresse = [f['Adresse 1'], f['Adresse 2'], f['Adresse 3']].filter(Boolean).join(', '), ville = [f['Code postal'], f.Ville].filter(Boolean).join(' ');
    var tels = ['Téléphone 1', 'Téléphone 2', 'Téléphone 3'].map(function (k) { return f[k]; }).filter(Boolean).map(function (t) { return '<a href="tel:' + esc(APP.tel(t)) + '">' + esc(t) + '</a>'; }).join('<span class="sep-inline"></span>');
    var mails = [f['Email principal'], f['Email secondaire']].filter(Boolean).map(function (m) { return '<a href="mailto:' + esc(m) + '">' + esc(m) + '</a>'; }).join('<span class="sep-inline"></span>');
    var liees = D.adrParMere.get(f._code) || [];
    var maj = f.maj_le ? '<span class="aide">Dernière mise à jour : ' + esc(H.heureParis(f.maj_le, true)) + (f.traite_par ? ' par ' + esc(f.traite_par) : '') + '</span>' : '';
    var h = '<article class="fiche verre"><header class="fiche-tete"><div><h2>' + esc(f['Raison sociale / Nom'] || 'Client sans nom') + '</h2><div class="tags">' + U.personne(f.traite_par) + (f['Type client'] ? U.tag(f['Type client'], 'marque') : '') + (f['Catégorie'] ? U.tag(f['Catégorie']) : '') + '<span class="code">Code ' + esc(f._code) + '</span></div>' + maj + '</div>' +
      '<span class="statut-pastille statut--' + statutClasse(f.statut) + '">' + esc(H.libelle(f.statut)) + '</span></header>' +
      '<div class="coords">' + coord('pin', 'Adresse', (adresse ? '<span>' + esc(adresse) + '</span>' : '') + (ville ? '<span>' + esc(ville) + '</span>' : '')) + coord('phone', 'Téléphone', tels || '<span class="aide">Aucun numéro</span>') + coord('mail', 'E-mail', mails || '<span class="aide">Aucune adresse</span>') + coord('building', 'SIREN', f.SIREN ? '<span class="num">' + esc(f.SIREN) + '</span>' : '<span class="aide">Non renseigné</span>') + '</div>' +
      (H.sansPictos(f['À compléter']) ? '<div class="msg msg--warn">' + icon('alert') + '<div><b>À compléter</b> : ' + esc(H.sansPictos(f['À compléter'])) + '</div></div>' : '');
    if (liees.length) {
      h += '<details class="options liees"><summary>' + icon('truck') + '<span>' + liees.length + ' adresse' + (liees.length > 1 ? 's' : '') + ' de livraison rattachée' + (liees.length > 1 ? 's' : '') + '</span></summary><div class="options-corps"><ul class="liste-adr">' + liees.map(function (a) {
        var s = D.suiviAdr.get(a['Code adresse']) || {};
        return '<li><div><b>' + esc(a['Nom site'] || a['Code adresse']) + '</b><span>' + esc([a['Adresse 1'], a.Ville].filter(Boolean).join(' · ')) + '</span></div>' + U.tag(H.libelle(s.statut_adr || 'À vérifier'), (s.statut_adr || '') === 'Vérifié ✅' ? 'ok' : (s.statut_adr || '') === 'Adresse obsolète' ? 'alerte' : '') + '<button type="button" class="btn btn--ghost btn--s" data-point="' + esc(a['Code adresse']) + '">Vérifier</button></li>';
      }).join('') + '</ul></div></details>';
    }
    return h + '</article>';
  }
  function statutClasse(s) { return { 'À appeler': 'appeler', 'À rappeler': 'rappeler', 'Injoignable': 'injoignable', 'Boudret': 'injoignable', 'Fait ✅': 'fait', 'Doublon': 'termine', 'Ancien client (à sortir)': 'termine' }[s] || 'appeler'; }

  /* ------------------------------------------------------------------ formulaire : résultat de l'appel */
  function htmlForm(f) {
    var produits = H.texte(f.produits).split('|').filter(function (x) { return H.PRODUITS.indexOf(x) >= 0; });
    var existe = H.EXISTE.indexOf(f.existe) >= 0 ? f.existe : 'Oui';
    var rappel = H.versIso(f.rappel_date);
    var cond = function (id, visible, corps) { return '<div class="cond' + (visible ? ' ouvert' : '') + '" id="' + id + '"><div>' + corps + '</div></div>'; };
    return '<form class="formulaire verre" id="a-form" novalidate autocomplete="off"><h2>Résultat de l\'appel</h2>' +
      '<div class="champ"><span class="lbl" id="l-statut">Statut</span>' + U.pastilles(H.STATUTS.map(function (s) { return { v: s, l: H.libelle(s) }; }), [f.statut], 'data-statut', { classe: 'pastilles--statut', label: 'Statut' }) + '</div>' +
      '<div class="champ"><span class="lbl">Client toujours actif ?</span>' + U.segment(H.EXISTE.map(function (x) { return { v: x, l: x }; }), existe, 'data-existe', 'seg--plein') + '</div>' +
      '<div class="champ"><span class="lbl">Produits achetés</span>' + U.pastilles(H.PRODUITS.map(function (p) { return { v: p, l: p }; }), produits, 'data-produit') + '</div>' +
      '<div class="rang"><div class="champ"><label for="a-email">E-mail confirmé ou corrigé</label><input class="saisie" id="a-email" type="email" inputmode="email" autocapitalize="none" value="' + esc(f.email_maj) + '"></div><div class="champ"><label for="a-tel">Téléphone confirmé ou corrigé</label><input class="saisie" id="a-tel" type="tel" inputmode="tel" value="' + esc(f.tel_maj) + '"></div></div>' +
      cond('c-doublon', f.statut === 'Doublon' || !!f.doublon_de, '<div class="champ"><label for="a-doublon">Doublon du client n°</label><input class="saisie" id="a-doublon" value="' + esc(f.doublon_de) + '"><small class="aide">Indiquez le code du client à conserver.</small></div>') +
      cond('c-motif', f.statut === 'Ancien client (à sortir)' || !!f.motif_sortie, '<div class="champ"><label for="a-motif">Motif de sortie</label><select class="saisie" id="a-motif">' + H.MOTIFS_SORTIE.map(function (m) { return '<option' + ((f.motif_sortie || '—') === m ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></div>') +
      cond('c-rappel', f.statut === 'À rappeler' || !!rappel, '<div class="champ"><label for="a-rappel">Date de rappel</label><input class="saisie" id="a-rappel" type="date" min="2020-01-01" max="' + H.ajouterJours(H.aujourdhui(), 365 * 5) + '" value="' + esc(rappel) + '">' + (rappel ? '<label class="case"><input type="checkbox" id="a-suppr-rappel"><span>Supprimer le rappel du ' + esc(H.jolieDate(rappel)) + '</span></label>' : '') + '</div>') +
      '<div class="champ"><label for="a-note">Notes</label><textarea class="saisie" id="a-note" rows="3" placeholder="Informations utiles pour la suite : demande du client, vérifications, documents à envoyer…">' + esc(f.note) + '</textarea></div>' +
      '<details class="options"><summary>' + icon('trash') + '<span>Effacer volontairement un champ</span></summary><div class="options-corps"><p class="aide">Un champ laissé vide ne remplace jamais une information déjà enregistrée. Sélectionnez ici ce que vous voulez réellement supprimer.</p>' + U.pastilles(Object.keys(H.CHAMPS_EFFACABLES).map(function (k) { return { v: k, l: k }; }), [], 'data-effacer') + '</div></details>' +
      '<div class="msgs" id="a-erreurs" aria-live="polite"></div>' +
      '<div class="actions-form"><button class="btn btn--main btn--grand" type="submit" id="a-envoyer">Enregistrer et passer à la suivante</button><span class="aide raccourci">Ctrl + Entrée</span></div></form>';
  }
  function htmlAdmin(f) {
    var actuel = f.traite_par || '', qui = ['Non traité'].concat(D.traitants());
    return '<details class="options admin"><summary>' + icon('shield') + '<span>Administration de la fiche</span></summary><form class="options-corps" id="a-admin"><p class="aide">Réservé à l\'administrateur. Modifie l\'attribution et le statut sans toucher aux autres informations. Chaque intervention est inscrite au journal.</p>' +
      '<div class="rang"><div class="champ"><label for="a-qui">Attribuer la fiche à</label><select class="saisie" id="a-qui">' + qui.map(function (q) { return '<option' + ((actuel || 'Non traité') === q ? ' selected' : '') + '>' + esc(q) + '</option>'; }).join('') + '</select></div>' +
      '<div class="champ"><label for="a-force">Forcer le statut</label><select class="saisie" id="a-force">' + H.STATUTS.map(function (s) { return '<option value="' + esc(s) + '"' + (f.statut === s ? ' selected' : '') + '>' + esc(H.libelle(s)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="actions"><button class="btn btn--ghost" type="submit">Appliquer la modification</button></div></form></details>';
  }

  /* ------------------------------------------------------------------ script d'appel */
  function jetons(f) {
    var c = H.texte(f['Raison sociale / Nom']).trim();
    return { client: c || 'Madame/Monsieur', appelant: (D.moi.nom || '').trim() || '[votre prénom]', produit: H.produitPrincipal(f) || '[produit]', collectivite: c || '[la collectivité]' };
  }
  function sub(texte, j) { Object.keys(j).forEach(function (k) { texte = texte.split('{' + k + '}').join(j[k]); }); return esc(texte); }
  function indexBranche(etape, sousType) {
    if (etape.groupe !== 'metier' || !sousType) return 0;
    for (var i = 0; i < etape.branches.length; i++) { var l = H.sansAccents(etape.branches[i].label); if (l.indexOf(sousType) >= 0 || (sousType === 'tp' && l.indexOf('btp') >= 0)) return i; }
    return 0;
  }
  function dire(l, j) { return l && l.length ? '<div class="sa-dire">' + l.map(function (d) { return '<p>« ' + sub(d, j) + ' »</p>'; }).join('') + '</div>' : ''; }
  function puces(l, j) { return l && l.length ? '<ul class="sa-relances">' + l.map(function (r) { return '<li>' + sub(r, j) + '</li>'; }).join('') + '</ul>' : ''; }
  function note(t, j, classe) { return t ? '<div class="' + (classe || 'sa-note') + '">' + sub(t, j) + '</div>' : ''; }
  function htmlScript(f, det) {
    var cle = E.scriptType || det.typologie, s = SC.scripts[cle], j = jetons(f);
    var onglets = SC.ordre.map(function (k) { return { v: k, l: { particulier: 'Particulier', pro: 'Professionnel', collectivite: 'Collectivité' }[k] }; });
    var etapes = s.etapes.map(function (e) {
      var br = '';
      if (e.branches && e.branches.length) {
        var actif = indexBranche(e, det.sous_type);
        br = (e.branches_titre ? '<div class="sa-branchtitre">' + esc(e.branches_titre) + '</div>' : '') + '<div class="seg seg--petit" data-sa-branches>' + e.branches.map(function (b, i) { return '<button type="button" data-v="' + i + '" aria-pressed="' + (i === actif) + '">' + esc(b.label) + '</button>'; }).join('') + '</div>' +
          e.branches.map(function (b, i) { return '<div class="sa-branche' + (i === actif ? '' : ' sa-cache') + '" data-i="' + i + '">' + dire(b.dire, j) + puces(b.relances, j) + note(b.note, j) + '</div>'; }).join('');
      }
      return '<article class="sa-etape"><h4><span class="sa-num">' + esc(e.numero) + '</span>' + esc(e.titre) + '</h4>' + dire(e.dire, j) + puces(e.relances, j) + br + note(e.note, j) + '</article>';
    }).join('');
    var objections = s.objections.map(function (o) {
      var brut = [o.intitule].concat(o.dire || [], o.puis || [], [o.conduite, o.alerte]).join(' '); Object.keys(j).forEach(function (k) { brut = brut.split('{' + k + '}').join(j[k]); });
      return '<details class="sa-obj" data-index="' + esc(H.sansAccents(brut)) + '"><summary>' + sub(o.intitule, j) + '</summary><div class="sa-rep">' + dire(o.dire, j) + puces(o.puis, j) + note(o.conduite, j) + note(o.alerte, j, 'sa-alerte') + '</div></details>';
    }).join('');
    return '<div class="sa" data-vue="' + E.scriptVue + '"><div class="sa-tete">' + U.segment(onglets, cle, 'data-sa-type') + '<p class="aide"><b>Type déduit :</b> ' + esc({ particulier: 'particulier', pro: 'professionnel', collectivite: 'collectivité' }[det.typologie]) + ' · ' + esc(det.motif) + ' <span class="tag tag--' + (det.confiance === 'forte' ? 'ok' : det.confiance === 'moyenne' ? '' : 'neutre') + '">confiance ' + esc(det.confiance) + '</span></p></div>' +
      '<div class="seg seg--plein sa-bascule" data-sa-vue>' + [{ v: 'deroule', l: 'Déroulé' }, { v: 'objections', l: 'Objections' }].map(function (x) { return '<button type="button" data-v="' + x.v + '" aria-pressed="' + (x.v === E.scriptVue) + '">' + x.l + '</button>'; }).join('') + '</div>' +
      '<div class="sa-corps"><div class="sa-col sa-deroule"><div class="sa-regles"><h4>Règles d\'or</h4><ul>' + s.regles_or.map(function (r) { return '<li>' + sub(r, j) + '</li>'; }).join('') + '</ul></div>' + etapes + '</div>' +
      '<div class="sa-col sa-objs"><label class="recherche">' + icon('loupe') + '<input class="saisie" type="search" id="sa-rech" placeholder="Chercher : prix, temps, SIREN…" aria-label="Chercher une objection"></label><div class="sa-liste" id="sa-liste">' + objections + '</div><p class="aide sa-aucune" hidden>Aucune objection ne correspond.</p>' +
      '<div class="sa-consigner"><h4>À consigner dans la fiche</h4><ul>' + s.a_consigner.map(function (c) { return '<li>' + sub(c, j) + '</li>'; }).join('') + '</ul></div></div></div></div>';
  }
  function rendreScript() {
    var z = $('#a-script'), f = E.affiche && D.baseParCode.get(E.affiche); if (!z || !f) return;
    var ouvert = E.scriptOuvert;
    var det = H.deviner(f);
    var sw = $('#a-sw'); if (sw) sw.checked = ouvert;
    z.classList.toggle('ouvert', ouvert);
    if (ouvert) { z.firstElementChild.innerHTML = htmlScript(f, det); APP.placerSegments(); }
    var info = $('#a-script-info'); if (info) info.textContent = 'Type déduit : ' + { particulier: 'particulier', pro: 'professionnel', collectivite: 'collectivité' }[det.typologie];
  }

  /* ------------------------------------------------------------------ affichage d'une fiche */
  function afficherFiche() {
    var z = $('#a-zone'), f = E.code ? D.baseParCode.get(E.code) : null;
    E.affiche = E.code; E.sale = false; E.scriptType = null;
    if (!f) {
      var vide = E.file.length === 0;
      z.innerHTML = '<div class="verre carte-vide">' + U.vide(vide ? 'Aucun client dans la file' : 'Fiche introuvable', vide ? (E.saut || E.jour ? 'Aucune fiche à afficher.' : 'Aucune fiche ne correspond aux filtres actuels. Modifiez les filtres ou passez aux livraisons.') : 'Ce code ne figure pas dans le classeur.', vide ? 'check' : 'alert', '<div class="actions">' + (E.saut || E.jour ? '<button class="btn btn--main" type="button" data-retour>Revenir à ma file</button>' : '<button class="btn btn--main" type="button" data-filtres>' + icon('filtre') + 'Modifier les filtres</button>') + '</div>') + '</div>';
      majBarre(); return;
    }
    E.majAffichee = f.maj_le;
    D.presence('client', f._code);
    var det = H.deviner(f);
    z.innerHTML = '<div class="appels-grille' + (APP.reduit() ? '' : ' entre') + '"><div class="colonne-fiche"><div id="a-verrou" class="msgs"></div>' + htmlFiche(f) +
      '<div class="script-bascule verre"><label class="interrupteur"><input type="checkbox" id="a-sw"' + (E.scriptOuvert ? ' checked' : '') + '><i></i><span>Script d\'appel et objections<small id="a-script-info">Type déduit : ' + esc({ particulier: 'particulier', pro: 'professionnel', collectivite: 'collectivité' }[det.typologie]) + '</small></span></label></div>' +
      '<div class="depliable' + (E.scriptOuvert ? ' ouvert' : '') + '" id="a-script"><div class="depliable-int"></div></div></div>' +
      '<div class="colonne-form">' + htmlForm(f) + (D.estRole('admin') ? htmlAdmin(f) : '') + '</div></div>';
    rendreScript(); majVerrou(); majBarre(); requestAnimationFrame(APP.placerSegments);
    if (!APP.reduit()) setTimeout(function () { var g = $('.appels-grille', z); if (g) g.classList.remove('entre'); }, 520);
  }

  /* ------------------------------------------------------------------ lecture / validation / enregistrement */
  function lire() {
    var z = $('#a-form');
    return {
      statut: (function () { var b = $('[data-statut][aria-pressed="true"]', z); return b ? b.getAttribute('data-statut') : 'À appeler'; })(),
      existe: ($('[data-existe][aria-pressed="true"]', z) || { dataset: {} }).dataset.v || 'Oui',
      produits: $$('[data-produit][aria-pressed="true"]', z).map(function (b) { return b.getAttribute('data-produit'); }),
      email: $('#a-email', z).value.trim(), tel: $('#a-tel', z).value.trim(), doublon: ($('#a-doublon', z) || { value: '' }).value.trim(),
      motif: ($('#a-motif', z) || { value: '—' }).value, rappel: ($('#a-rappel', z) || { value: '' }).value, supprRappel: !!($('#a-suppr-rappel', z) || {}).checked,
      note: $('#a-note', z).value.trim(), effacer: $$('[data-effacer][aria-pressed="true"]', z).map(function (b) { return b.getAttribute('data-effacer'); })
    };
  }
  function erreurs(v) {
    var e = [], z = $('#a-form');
    $$('[aria-invalid="true"]', z).forEach(function (x) { x.setAttribute('aria-invalid', 'false'); });
    var bad = function (id) { var c = $(id, z); if (c) c.setAttribute('aria-invalid', 'true'); };
    if (v.email && !/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(v.email)) { e.push('l\'adresse e-mail ne semble pas valide'); bad('#a-email'); }
    if (v.statut === 'Doublon' && !v.doublon) { e.push('indiquez le code du client à conserver'); bad('#a-doublon'); }
    if (v.statut === 'Ancien client (à sortir)' && v.motif === '—') { e.push('indiquez le motif de sortie'); bad('#a-motif'); }
    if (v.statut === 'À rappeler' && (!v.rappel || v.supprRappel)) { e.push('indiquez une date de rappel'); bad('#a-rappel'); }
    return e;
  }
  function enregistrer() {
    if (E.occupe || !E.affiche) return;
    var v = lire(), err = erreurs(v), z = $('#a-erreurs');
    if (err.length) { z.innerHTML = APP.message('err', 'Avant d\'enregistrer : ' + esc(err.join(', ')) + '.'); var premier = $('[aria-invalid="true"]', $('#a-form')); if (premier) premier.focus(); return; }
    z.innerHTML = '';
    var code = E.affiche, suivant = codeSuivant(), btn = $('#a-envoyer'), etaitSaut = !!E.saut;
    var effacements = v.effacer.map(function (l) { return H.CHAMPS_EFFACABLES[l]; }); if (v.supprRappel) effacements.push('rappel_date');
    var champs = { statut: v.statut, existe: v.existe, produits: v.produits.join('|'), email_maj: v.email, tel_maj: v.tel, doublon_de: v.doublon, note: v.note, motif_sortie: v.motif === '—' ? '' : v.motif, rappel_date: v.supprRappel ? '' : v.rappel };
    E.occupe = true; APP.occupe(btn, 'Enregistrement…');
    D.enregistrerFiche(code, champs, effacements).then(function (r) {
      E.occupe = false; E.sale = false; APP.libere(btn);
      APP.toast('Fiche enregistrée : ' + H.libelle(r.statut) + '.');
      if (etaitSaut) { E.saut = ''; E.code = ''; V.majFile(); return; }
      E.code = suivant && suivant !== code ? suivant : code; V.majFile(suivant && suivant !== code ? undefined : 'garder');
      if (!suivant || suivant === code) { E.affiche = null; afficherFiche(); }
    }, function (e) {
      E.occupe = false; APP.libere(btn);
      z.innerHTML = APP.message('err', 'Enregistrement impossible : ' + esc(e.message) + ' Vos champs restent affichés : réessayez dans quelques secondes.');
    });
  }
  function appliquerAdmin() {
    var code = E.affiche, f = D.baseParCode.get(code), qui = $('#a-qui').value, statut = $('#a-force').value, traitant = qui === 'Non traité' ? '' : qui;
    if (traitant === (f.traite_par || '') && statut === f.statut) { APP.toast('Aucun changement à appliquer.'); return; }
    D.reattribuer(code, traitant, statut).then(function () { APP.toast('Fiche ' + code + ' : attribuée à ' + (traitant || 'personne') + ', statut « ' + H.libelle(statut) + ' ».'); E.affiche = null; V.majFile('garder'); }, function (e) { APP.toast(e.message, 'err'); });
  }

  /* ------------------------------------------------------------------ évènements de l'écran */
  function clicEcran(e) {
    var b;
    if ((b = e.target.closest('[data-nav]'))) return naviguer(+b.dataset.nav);
    if (e.target.closest('[data-filtres]')) return ouvrirFiltres();
    if ((b = e.target.closest('[data-retirer]'))) {
      var cle = b.dataset.retirer, v = b.dataset.v; if (cle === 'aCompleter') E.f.aCompleter = false; else E.f[cle] = E.f[cle].filter(function (x) { return x !== v; });
      enregistrerFiltres(); return confirmerSortie().then(function (ok) { if (ok) V.majFile(); });
    }
    if (e.target.closest('[data-retour]')) return confirmerSortie().then(function (ok) { if (!ok) return; E.saut = ''; E.jour = ''; E.code = ''; V.majFile(); });
    if ((b = e.target.closest('[data-jour]'))) return confirmerSortie().then(function (ok) { if (ok) { E.jour = b.dataset.jour; E.saut = ''; E.code = ''; V.majFile(); } });
    if ((b = e.target.closest('[data-point]'))) return APP.ouvrirPoint(b.dataset.point);
    if ((b = e.target.closest('[data-statut]'))) {
      $$('[data-statut]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); E.sale = true;
      var s = b.dataset.statut; $('#c-doublon').classList.toggle('ouvert', s === 'Doublon' || !!($('#a-doublon') || {}).value); $('#c-motif').classList.toggle('ouvert', s === 'Ancien client (à sortir)'); $('#c-rappel').classList.toggle('ouvert', s === 'À rappeler' || !!($('#a-rappel') || {}).value);
      return;
    }
    if ((b = e.target.closest('[data-produit],[data-effacer]'))) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); E.sale = true; return; }
    if ((b = e.target.closest('[data-existe]'))) { $$('[data-existe]', b.parentNode).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); APP.glisse(b.parentNode); E.sale = true; return; }
    if ((b = e.target.closest('[data-sa-type]'))) { E.scriptType = b.dataset.v; var f = D.baseParCode.get(E.affiche); $('#a-script').firstElementChild.innerHTML = htmlScript(f, H.deviner(f)); APP.placerSegments(); return; }
    if ((b = e.target.closest('[data-sa-vue] button'))) { E.scriptVue = b.dataset.v; var sa = $('.sa'); sa.setAttribute('data-vue', E.scriptVue); $$('button', b.parentNode).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); APP.glisse(b.parentNode); return; }
    if ((b = e.target.closest('[data-sa-branches] button'))) { var seg = b.parentNode, etape = seg.parentNode; $$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $$('.sa-branche', etape).forEach(function (x) { x.classList.toggle('sa-cache', x.dataset.i !== b.dataset.v); }); APP.glisse(seg); return; }
  }
  function saisieEcran(e) {
    var t = e.target;
    if (t.id === 'a-sw') { E.scriptOuvert = t.checked; APP.prefMoi('script', t.checked); rendreScript(); return; }
    if (t.id === 'sa-rech') { filtrerObjections(t.value); return; }
    if (t.closest && t.closest('#a-form')) {
      E.sale = true;
      if (t.id === 'a-rappel') $('#c-rappel').classList.add('ouvert');
      if (t.id === 'a-doublon' && t.value) $('#c-doublon').classList.add('ouvert');
      if (t.tagName === 'TEXTAREA') { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 320) + 'px'; }
    }
  }
  function filtrerObjections(q) {
    var n = H.sansAccents(q).trim(), liste = $$('.sa-obj'), vus = 0;
    liste.forEach(function (d) { var ok = !n || d.dataset.index.indexOf(n) >= 0; d.hidden = !ok; if (ok) vus++; d.open = !!n && ok && vus === 1; });
    var a = $('.sa-aucune'); if (a) a.hidden = vus > 0;
  }

  /* ------------------------------------------------------------------ tiroir des filtres */
  function ouvrirFiltres() {
    var types = []; D.base.forEach(function (b) { var t = b['Type client']; if (t && types.indexOf(t) < 0) types.push(t); }); types.sort();
    var f = APP.fenetre('<div class="tiroir verre" role="dialog" aria-label="Filtres de la file"><div class="titre-tiroir"><h2>Filtres de la file</h2><button class="icone-btn" type="button" data-fermer aria-label="Fermer">' + icon('croix') + '</button></div><div id="fl-corps"></div>' +
      '<div class="actions tiroir-pied"><button class="btn btn--main" type="button" id="fl-voir"></button><button class="btn btn--ghost" type="button" id="fl-raz">Réinitialiser</button></div></div>', { classe: 'dlg-tiroir' });
    function corps() {
      $('#fl-corps', f.el).innerHTML =
        '<section class="mobile-seulement"><h3 class="etiquette">Accès direct</h3><form id="fl-direct" class="acces-direct" autocomplete="off"><input class="saisie" id="fl-code" placeholder="Code client exact" aria-label="Code client exact"><button class="btn btn--ghost btn--s" type="submit">Ouvrir</button></form></section>' +
        '<section><h3 class="etiquette">Traitement</h3><p class="aide">« Non traité » ne montre que les fiches que personne n\'a encore prises : c\'est ce qui évite les doublons d\'appel.</p>' + U.pastilles(['Non traité'].concat(D.traitants().map(function (n) { return 'Traité par ' + n; })).map(function (x) { return { v: x, l: x }; }), E.f.traitement, 'data-f-traitement') + '</section>' +
        '<section><h3 class="etiquette">Statut d\'appel</h3>' + U.pastilles(H.STATUTS.map(function (s) { return { v: s, l: H.libelle(s) }; }), E.f.statuts, 'data-f-statut') + '</section>' +
        '<section><h3 class="etiquette">Type de client</h3>' + U.pastilles(types.map(function (x) { return { v: x, l: x }; }), E.f.types, 'data-f-type') + '</section>' +
        '<section class="interrupteurs"><label class="interrupteur"><input type="checkbox" data-f-opt="aCompleter"' + (E.f.aCompleter ? ' checked' : '') + '><i></i><span>Uniquement les fiches « À compléter »<small>Le champ « À compléter » du classeur n\'est pas vide.</small></span></label>' +
        '<label class="interrupteur"><input type="checkbox" data-f-opt="masquer"' + (E.f.masquer ? ' checked' : '') + '><i></i><span>Masquer les fiches ouvertes par quelqu\'un d\'autre<small>Une fiche consultée depuis moins de ' + H.VERROU_MINUTES + ' minutes est retirée de la file.</small></span></label>' +
        '<label class="interrupteur"><input type="checkbox" data-f-opt="tri"' + (E.f.tri ? ' checked' : '') + '><i></i><span>Trier par priorité<small>Les professionnels d\'abord, les particuliers en dernier.</small></span></label></section>';
      var n = H.construireFile(D.base, Object.assign({}, E.f, { ouvertes: D.codesOuverts('client') }), D.traitants()).length;
      $('#fl-voir', f.el).textContent = 'Voir ' + APP.fmt.entier(n) + ' fiche' + (n > 1 ? 's' : '');
    }
    corps();
    var basculer = function (liste, v) { var i = liste.indexOf(v); if (i < 0) liste.push(v); else liste.splice(i, 1); };
    f.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f-traitement],[data-f-statut],[data-f-type]'); if (!b) return;
      if (b.hasAttribute('data-f-traitement')) basculer(E.f.traitement, b.getAttribute('data-f-traitement')); else if (b.hasAttribute('data-f-statut')) basculer(E.f.statuts, b.getAttribute('data-f-statut')); else basculer(E.f.types, b.getAttribute('data-f-type'));
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); appliquer();
    });
    f.el.addEventListener('submit', function (e) { if (e.target.id !== 'fl-direct') return; e.preventDefault(); var v = $('#fl-code', f.el).value; if (!v.trim()) return; f.fermer(); setTimeout(function () { $('#a-code').value = v; $('#a-direct').requestSubmit(); }, 260); });
    f.el.addEventListener('change', function (e) { var o = e.target.getAttribute('data-f-opt'); if (o) { E.f[o] = e.target.checked; appliquer(); } });
    var appliquer = function () {
      enregistrerFiltres(); var n = H.construireFile(D.base, Object.assign({}, E.f, { ouvertes: D.codesOuverts('client') }), D.traitants()).length;
      $('#fl-voir', f.el).textContent = 'Voir ' + APP.fmt.entier(n) + ' fiche' + (n > 1 ? 's' : ''); E.dirtyFiltres = true;
    };
    $('[data-fermer]', f.el).onclick = f.fermer;
    $('#fl-voir', f.el).onclick = function () { f.fermer(); };
    $('#fl-raz', f.el).onclick = function () { E.f = Object.assign({}, DEF, { traitement: ['Non traité'], statuts: ['À appeler', 'À rappeler'], types: [], recherche: E.f.recherche }); enregistrerFiltres(); corps(); E.dirtyFiltres = true; };
    f.el.addEventListener('close', function () { if (E.dirtyFiltres) { E.dirtyFiltres = false; E.jour = ''; E.saut = ''; confirmerSortie().then(function (ok) { if (ok) { E.sale = false; V.majFile(); } else { V.majFile('garder'); } }); } });
  }

  /* ------------------------------------------------------------------ cycle de vie */
  V.codeAffiche = function () { return E.affiche || ''; };
  V.rendre = function () {
    if (!V.construit) { chargerFiltres(); squelette(); V.construit = true; }
    E.affiche = null; V.majFile();
  };
  V.actualiser = function () { if (!V.construit) return V.rendre(); V.majFile('garder'); };
  V.ouvrir = function (opts) {
    opts = opts || {};
    if (opts.saut) { confirmerSortie().then(function (ok) { if (ok) { E.saut = opts.saut; E.jour = ''; E.code = ''; V.majFile(true); } }); }
    else if (opts.jour) { confirmerSortie().then(function (ok) { if (ok) { E.jour = opts.jour; E.saut = ''; E.code = ''; V.majFile(true); } }); }
    APP.placerSegments();
  };
})();
