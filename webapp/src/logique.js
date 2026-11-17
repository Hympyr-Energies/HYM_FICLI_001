/* Cockpit appels · logique métier pure (aucun accès au DOM) : constantes, dates, file d'appel, rappels, indicateurs, détection de la typologie,
   préparation des exports. Port fidèle de app.py et script.py ; testé contre le Python (tests/parite.test.js). Utilisable dans le navigateur (window.HYM) et dans Node. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.HYM = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var H = {};

  /* ------------------------------------------------------------------ constantes (valeurs stockées = celles de l'ancien outil) */
  H.PRODUITS = ['GNR', 'Gasoil routier', 'Sans plomb', 'AdBlue', 'Fioul domestique', 'HVO', 'Granulés de bois', 'Lubrifiants / Huiles'];
  H.STATUTS = ['À appeler', 'À rappeler', 'Injoignable', 'Boudret', 'Fait ✅', 'Doublon', 'Ancien client (à sortir)'];
  H.STATUTS_TERMINES = ['Fait ✅', 'Doublon', 'Ancien client (à sortir)'];
  H.STATUTS_ADRESSE = ['À vérifier', 'Vérifié ✅', 'Adresse obsolète'];
  H.EXISTE = ['Oui', 'Non', 'Incertain'];
  H.MOTIFS_SORTIE = ['—', 'Passé à la concurrence', 'Utilise une autre énergie', 'Décès', 'Cessation d\'activité / fermeture', 'Ne souhaite plus être contacté', 'Injoignable définitivement', 'Autre'];
  H.CHAMPS_EFFACABLES = { 'Produits achetés': 'produits', 'E-mail confirmé': 'email_maj', 'Téléphone confirmé': 'tel_maj', 'Doublon du client n°': 'doublon_de', 'Motif de sortie': 'motif_sortie', 'Notes': 'note' };
  H.CHAMPS_EFFACABLES_ADR = { 'Référent sur place': 'referent', 'Téléphone du site': 'tel_site', 'Note': 'note_adr' };
  H.LIBELLES_VIDES = ['Non traité', 'Non traitée', 'Non vérifié', 'Non vérifiée', '—', '-'];
  H.ECHEANCE = '2027-09-01';
  H.VERROU_MINUTES = 12;
  H.JOURS_SEMAINE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  H.MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /** Les écrans n'affichent pas le symbole historique des statuts (« Fait ✅ ») : la valeur stockée reste celle de l'ancien outil. */
  H.libelle = function (valeur) { return String(valeur === null || valeur === undefined ? '' : valeur).replace(/\s*✅\s*/g, '').trim(); };
  H.estTermine = function (statut) { return H.STATUTS_TERMINES.indexOf(statut) >= 0; };

  /* ------------------------------------------------------------------ texte */
  H.texte = function (v) { return v === null || v === undefined ? '' : String(v); };
  H.sansAccents = function (t) { return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  /** Retire les pictogrammes que contiennent certaines données du classeur (champ « À compléter ») : les écrans n'en affichent aucun. */
  H.sansPictos = function (t) { return H.texte(t).replace(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim(); };
  H.formaterEntier = function (n) { return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  H.trouverColonne = function (colonnes, cibles) {
    var norm = {}; colonnes.forEach(function (c) { norm[String(c).trim().toLowerCase()] = c; });   // comme l'ancien outil : à nom égal, la dernière colonne l'emporte
    for (var i = 0; i < cibles.length; i++) if (cibles[i] in norm) return norm[cibles[i]];
    return null;
  };

  /* ------------------------------------------------------------------ dates : jours civils sans fuseau, horodatages UTC convertis à l'affichage */
  H.dateIso = function (d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  H.aujourdhui = function () { return H.dateIso(new Date()); };
  var utc = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  H.estIso = function (t) { return /^\d{4}-\d{2}-\d{2}$/.test(t || '') && !isNaN(utc(t)) && new Date(utc(t)).toISOString().slice(0, 10) === t; };
  H.ajouterJours = function (iso, n) { return new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10); };
  H.joursEntre = function (a, b) { return Math.round((utc(b) - utc(a)) / 86400000); };
  H.jourSemaine = function (iso) { return (new Date(utc(iso)).getUTCDay() + 6) % 7; };   // 0 = lundi
  H.joursOuvres = function (debut, fin) {
    if (utc(fin) <= utc(debut)) return 0;
    var n = 0, d = debut;
    while (utc(d) < utc(fin)) { if (H.jourSemaine(d) < 5) n++; d = H.ajouterJours(d, 1); }
    return n;
  };
  H.dateApresJoursOuvres = function (depart, nb) {
    var d = depart, restants = Math.max(0, Math.trunc(nb));
    while (restants > 0) { d = H.ajouterJours(d, 1); if (H.jourSemaine(d) < 5) restants--; }
    return d;
  };
  /** Date d'une valeur ISO (AAAA-MM-JJ…) ou JJ/MM/AAAA ; '' si illisible. L'ISO est testé en premier (« 2026-09-03 » n'est pas le 9 mars). */
  H.versIso = function (valeur) {
    var t = H.texte(valeur).trim(); if (!t) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) { var i = m[1] + '-' + m[2] + '-' + m[3]; return H.estIso(i) ? i : ''; }
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(t);
    if (m) { var a = m[3].length === 2 ? '20' + m[3] : m[3], j = ('0' + m[1]).slice(-2), mo = ('0' + m[2]).slice(-2), c = a + '-' + mo + '-' + j; return H.estIso(c) ? c : ''; }
    return '';
  };
  H.jolieDate = function (iso) { var i = H.versIso(iso); return i ? i.slice(8, 10) + '/' + i.slice(5, 7) + '/' + i.slice(0, 4) : H.texte(iso); };
  /** Horodatage UTC « AAAA-MM-JJTHH:MM:SS » → heure de Paris. */
  H.heureParis = function (ts, avecHeure) {
    var t = H.texte(ts).trim(); if (!t) return '';
    var d = new Date(/Z|[+-]\d\d:?\d\d$/.test(t) ? t : t.replace(' ', 'T') + 'Z'); if (isNaN(d)) return t;
    var o = { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' };
    if (avecHeure) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleString('fr-FR', o).replace(',', '');
  };
  H.jourDe = function (ts) { return H.texte(ts).slice(0, 10); };

  /* ------------------------------------------------------------------ typologie du client */
  H.priorite = function (type) {
    var t = H.texte(type).toLowerCase();
    if (t.indexOf('pro') === 0 && t.indexOf('déduit') < 0) return 0;
    if (t.indexOf('pro') === 0) return 1;
    if (t.indexOf('déterminer') >= 0) return 2;
    if (t.indexOf('public') >= 0 || t.indexOf('asso') >= 0) return 3;
    return 4;
  };
  H.estPro = function (type) { return H.texte(type).indexOf('Pro') === 0; };

  var MOTS_PUBLIC = ['mairie', 'commune de', 'ville de', 'syndicat', 'sivom', 'sivu', 'siaep', 'smictom', 'sictom', 'ccas', 'sdis', 'communaute de communes', 'communaute d agglomeration', 'conseil departemental', 'departement de', 'region ', 'college', 'lycee', 'ehpad', 'chu ', 'centre hospitalier', 'office public', 'opac', 'ophlm', 'regie municipale', 'etablissement public', 'cias', 'smd', 'sydeco', 'sdet', 'prefecture', 'gendarmerie', 'sivos'];
  var MOTS_SOCIETE = ['sarl', 's.a.r.l', ' sas', 's.a.s', 'sasu', ' sa ', 'eurl', 'snc', 'sci', 'earl', 'gaec', 'scea', 'sce ', 'sccv', 'sarlu', 'entreprise', 'ets ', 'etablissements', 'societe', 'cooperative', 'cuma', 'groupement'];
  var MOTS_AGRI = ['earl', 'gaec', 'scea', 'agricole', 'exploitation', 'ferme', 'domaine', 'elevage', 'viticole', 'vignoble', 'cuma', 'polyculture'];
  var MOTS_TRANSPORT = ['transport', 'transports', 'logistique', 'messagerie', 'fret', 'autocar', 'taxi', 'ambulance', 'deménagement', 'demenagement'];
  var MOTS_TP = ['tp', 'travaux publics', 'btp', 'terrassement', 'batiment', 'vrd', 'carriere', 'demolition', 'assainissement', 'genie civil', 'maconnerie', 'espaces verts', 'paysag'];
  var CLES_SIRET = ['siret', 'siren', 'n siret', 'no siret', 'numero siret', 'identifiant'];
  var CLES_TYPE = ['typologie', 'type client', 'type_client', 'categorie', 'catégorie', 'segment', 'type', 'famille', 'qualite', 'civilite', 'civilité'];
  var CLES_NOM = ['raison sociale', 'raison_sociale', 'nom', 'client', 'libelle', 'libellé', 'denomination', 'intitule', 'societe', 'société'];
  var CLES_NAF = ['naf', 'ape', 'code naf', 'code ape', 'activite', 'activité'];
  var NULS = { nan: 1, none: 1, nat: 1 };

  function valeursDe(fiche, cles) {
    var trouvees = [];
    Object.keys(fiche).forEach(function (cle) {
      if (cle.charAt(0) === '_') return;                  // propriétés internes de l'interface
      var v = fiche[cle]; if (v === null || v === undefined) return;
      var n = H.sansAccents(cle);
      if (cles.some(function (mot) { return n.indexOf(mot) >= 0; })) {
        var t = String(v).trim(); if (t && !(t.toLowerCase() in NULS)) trouvees.push(t);
      }
    });
    return trouvees;
  }
  function sousTypePro(blob, naf) {
    var num = naf.replace(/[^0-9]/g, '').slice(0, 2);
    if (['01', '02', '03'].indexOf(num) >= 0) return ['agriculture', 'code NAF agricole'];
    if (['49', '52', '53'].indexOf(num) >= 0) return ['transport', 'code NAF transport'];
    if (['41', '42', '43', '08', '23', '81'].indexOf(num) >= 0) return ['tp', 'code NAF construction / TP'];
    var a = function (liste) { return liste.some(function (m) { return blob.indexOf(m) >= 0; }); };
    if (a(MOTS_AGRI)) return ['agriculture', 'raison sociale de type exploitation agricole'];
    if (a(MOTS_TRANSPORT)) return ['transport', 'raison sociale de type transport'];
    if (a(MOTS_TP)) return ['tp', 'raison sociale de type TP / BTP'];
    return ['', ''];
  }
  /** Déduit le script d'appel (particulier / pro / collectivité) depuis la fiche ; simple présélection, modifiable d'un clic. */
  H.deviner = function (fiche) {
    if (!fiche || !Object.keys(fiche).length) return { typologie: 'particulier', sous_type: '', motif: 'aucune donnée fiche : onglet par défaut', confiance: 'faible' };
    var valeursType = valeursDe(fiche, CLES_TYPE), noms = valeursDe(fiche, CLES_NOM), naf = valeursDe(fiche, CLES_NAF).join(' ');
    var blob = ' ' + H.sansAccents(noms.concat(valeursType, [naf]).join(' ')) + ' ';
    function pro(motif, confiance) { var s = sousTypePro(blob, naf); return { typologie: 'pro', sous_type: s[0], motif: motif + (s[1] ? ' · ' + s[1] : ''), confiance: confiance }; }
    for (var i = 0; i < valeursType.length; i++) {
      var brut = valeursType[i], v = H.sansAccents(brut), a = function (l) { return l.some(function (m) { return v.indexOf(m) >= 0; }); };
      if (a(['collectiv', 'mairie', 'public', 'administration', 'commune'])) return { typologie: 'collectivite', sous_type: '', motif: 'colonne de type : « ' + brut + ' »', confiance: 'forte' };
      if (a(['particulier', 'prive', 'menage', 'domestique', 'monsieur', 'madame'])) return { typologie: 'particulier', sous_type: '', motif: 'colonne de type : « ' + brut + ' »', confiance: 'forte' };
      if (a(['pro', 'entreprise', 'societe', 'agri', 'tp', 'transport', 'btp', 'asso', 'artisan', 'commerc'])) return pro('colonne de type : « ' + brut + ' »', v.indexOf('deduit') >= 0 ? 'moyenne' : 'forte');
    }
    if (MOTS_PUBLIC.some(function (m) { return blob.indexOf(m) >= 0; })) return { typologie: 'collectivite', sous_type: '', motif: 'raison sociale de type entité publique', confiance: 'forte' };
    var sirets = valeursDe(fiche, CLES_SIRET);
    for (var j = 0; j < sirets.length; j++) {
      var chiffres = sirets[j].replace(/[^0-9]/g, '');
      if (chiffres.length === 9 || chiffres.length === 14) {
        if ('12'.indexOf(chiffres[0]) >= 0) return { typologie: 'collectivite', sous_type: '', motif: 'SIREN commençant par ' + chiffres[0] + ' (organisme public)', confiance: 'moyenne' };
        return pro('SIREN/SIRET renseigné', 'forte');
      }
    }
    if (MOTS_SOCIETE.some(function (m) { return blob.indexOf(m) >= 0; })) return pro('forme juridique détectée dans la raison sociale', 'moyenne');
    return { typologie: 'particulier', sous_type: '', motif: 'aucun marqueur professionnel ni public trouvé', confiance: 'faible' };
  };
  /** Premier produit enregistré sur la fiche, injecté dans les phrases du script. */
  H.produitPrincipal = function (ligne) {
    var parts = H.texte(ligne.produits).split('|');
    for (var i = 0; i < parts.length; i++) if (parts[i].trim()) return parts[i].trim();
    return '';
  };

  /* ------------------------------------------------------------------ classeur et suivi : construction de la base de travail */
  var CHAMPS_SUIVI = ['statut', 'existe', 'produits', 'email_maj', 'tel_maj', 'note', 'doublon_de', 'rappel_date', 'motif_sortie', 'traite_par', 'maj_le'];
  H.CHAMPS_SUIVI = CHAMPS_SUIVI;
  /** { colonnes, lignes } → tableau d'objets (une propriété par colonne). */
  H.objetsDepuisTableau = function (t) {
    var cols = t.colonnes || [], n = cols.length;
    return (t.lignes || []).map(function (l) { var o = {}; for (var i = 0; i < n; i++) o[cols[i]] = l[i] === null || l[i] === undefined ? '' : String(l[i]); return o; });
  };
  /** Fiche de travail : colonnes du classeur + champs de suivi (valeurs par défaut comme l'ancien outil) + priorité. */
  H.fusionnerClient = function (client, suivi, colCode) {
    var o = Object.assign({}, client);
    var s = suivi || {};
    if (suivi) o.code_client = s.code_client;
    CHAMPS_SUIVI.forEach(function (c) { o[c] = s[c] === null || s[c] === undefined ? '' : String(s[c]); });
    if (!o.statut) o.statut = 'À appeler';
    o.priorite = H.priorite(client['Type client']);
    o._code = String(client[colCode]);
    return o;
  };
  /** Une fiche de suivi a changé : met à jour la fiche de travail correspondante. */
  H.appliquerSuivi = function (fiche, suivi) {
    CHAMPS_SUIVI.forEach(function (c) { fiche[c] = suivi[c] === null || suivi[c] === undefined ? '' : String(suivi[c]); });
    if (!fiche.statut) fiche.statut = 'À appeler';
    fiche.code_client = suivi.code_client;
  };

  /* ------------------------------------------------------------------ file d'appel */
  /** Filtres : { traitement:[], masquerOuvertes, ouvertes:Set, types:[], statuts:[], aCompleter, recherche, tri:bool }. Tri comme l'ancien outil : priorité, puis nom (ordre des codes de caractères). */
  H.construireFile = function (base, f, traitants) {
    var res = base;
    if (f.traitement && f.traitement.length) {
      var nt = f.traitement.indexOf('Non traité') >= 0, noms = {};
      traitants.forEach(function (n) { if (f.traitement.indexOf('Traité par ' + n) >= 0) noms[n] = 1; });
      res = res.filter(function (r) { var t = H.texte(r.traite_par); return (nt && t.trim() === '') || (t in noms); });
    }
    if (f.masquerOuvertes && f.ouvertes && f.ouvertes.size) res = res.filter(function (r) { return !f.ouvertes.has(r._code); });
    if (f.types && f.types.length) res = res.filter(function (r) { return f.types.indexOf(r['Type client']) >= 0; });
    if (f.statuts && f.statuts.length) res = res.filter(function (r) { return f.statuts.indexOf(r.statut) >= 0; });
    if (f.aCompleter) res = res.filter(function (r) { return H.texte(r['À compléter']).trim() !== ''; });
    if (f.recherche) {
      var q = f.recherche.toLowerCase();
      res = res.filter(function (r) { return r._code.toLowerCase().indexOf(q) >= 0 || H.texte(r['Raison sociale / Nom']).toLowerCase().indexOf(q) >= 0 || H.texte(r.Ville).toLowerCase().indexOf(q) >= 0; });
    }
    var nom = function (r) { return H.texte(r['Raison sociale / Nom']); };
    var cmp = function (a, b) { var x = nom(a), y = nom(b); return x < y ? -1 : x > y ? 1 : 0; };
    res = res.slice();
    // Tri stable (Array.prototype.sort l'est en JS moderne).
    res.sort(f.tri === false ? cmp : function (a, b) { return a.priorite - b.priorite || cmp(a, b); });
    return res;
  };

  /* ------------------------------------------------------------------ rappels */
  /** Fiches « À rappeler » avec une date lisible ; { fiche, date } triées par date. */
  H.rappelsPlanifies = function (base, utilisateur) {
    var res = [];
    base.forEach(function (r) {
      if (r.statut !== 'À rappeler' || !H.texte(r.rappel_date).trim()) return;
      var d = H.versIso(r.rappel_date); if (!d) return;
      if (utilisateur && r.traite_par !== utilisateur) return;
      res.push({ fiche: r, date: d });
    });
    res.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return res;
  };
  H.rappelsDus = function (base, utilisateur, aujourdhui) { return H.rappelsPlanifies(base, utilisateur).filter(function (x) { return x.date <= aujourdhui; }); };
  H.classeCharge = function (n, jour, aujourdhui) { if (n === 0) return 'vide'; if (jour < aujourdhui) return 'retard'; if (n >= 8) return 'charge'; if (n >= 4) return 'moyen'; return 'leger'; };

  /* ------------------------------------------------------------------ indicateurs */
  H.calculerRythme = function (suivi, utilisateur) {
    var jours = {}, n = 0;
    suivi.forEach(function (s) {
      if (!H.estTermine(s.statut)) return;
      if (utilisateur && s.traite_par !== utilisateur) return;
      n++; var j = H.jourDe(s.maj_le); if (j) jours[j] = 1;
    });
    var nj = Object.keys(jours).length;
    return n && nj ? n / nj : null;
  };
  H.statsUtilisateur = function (suivi, suiviAdr, nom, compteurs) {
    var s = suivi.filter(function (x) { return x.traite_par === nom; }), a = suiviAdr.filter(function (x) { return x.traite_par === nom; });
    return {
      fiches: s.length, terminees: s.filter(function (x) { return H.estTermine(x.statut); }).length,
      aujourdhui: (compteurs && compteurs[nom + '|client']) || 0, a_rappeler: s.filter(function (x) { return x.statut === 'À rappeler'; }).length,
      points: a.length, points_aujourdhui: (compteurs && compteurs[nom + '|adresse']) || 0, rythme: H.calculerRythme(suivi, nom)
    };
  };
  H.objectif = function (restant, aujourdhui) {
    var jo = H.joursOuvres(aujourdhui, H.ECHEANCE);
    return { jours: jo, parJour: jo > 0 ? Math.ceil(restant / jo) : null };
  };
  /** Reporting des appels : clients distincts par jour et par personne (origine « appel », fiches clients). */
  H.rapportJournalier = function (appels, jours, aujourdhui) {
    var depuis = H.ajouterJours(aujourdhui, -(jours - 1));
    var brut = appels.filter(function (a) { return a.jour >= depuis; });
    var util = brut.filter(function (a) { return a.origine === 'appel' && a.type_fiche === 'client'; });
    if (!util.length) return { vide: true, depuis: depuis };
    var vus = {}, uniques = [];
    util.forEach(function (a) { var k = a.jour + '\u0001' + a.utilisateur + '\u0001' + a.code; if (!vus[k]) { vus[k] = 1; uniques.push(a); } });
    var personnes = [], parJour = {};
    uniques.forEach(function (a) { if (personnes.indexOf(a.utilisateur) < 0) personnes.push(a.utilisateur); (parJour[a.jour] = parJour[a.jour] || {})[a.utilisateur] = ((parJour[a.jour] || {})[a.utilisateur] || 0) + 1; });
    personnes.sort();
    var calendrier = [], d = depuis; while (d <= aujourdhui) { calendrier.push(d); d = H.ajouterJours(d, 1); }
    var tableau = calendrier.map(function (j) { var l = { jour: j, total: 0 }; personnes.forEach(function (p) { l[p] = (parJour[j] && parJour[j][p]) || 0; l.total += l[p]; }); return l; });
    var parStatut = {}; uniques.forEach(function (a) { var p = parStatut[a.utilisateur] = parStatut[a.utilisateur] || {}; p[a.statut] = (p[a.statut] || 0) + 1; });
    var pts = {}; brut.filter(function (a) { return a.origine === 'appel' && a.type_fiche === 'adresse'; }).forEach(function (a) { pts[a.jour + '\u0001' + a.utilisateur + '\u0001' + a.code] = 1; });
    return {
      vide: false, depuis: depuis, personnes: personnes, tableau: tableau, parStatut: parStatut, total: uniques.length, points: Object.keys(pts).length,
      jours_actifs: tableau.filter(function (l) { return l.total > 0; }).length, hors_appels: brut.filter(function (a) { return a.origine !== 'appel'; }).length
    };
  };

  /* ------------------------------------------------------------------ exports (mêmes colonnes que l'ancien outil) */
  H.COLONNES_EXPORT_CLIENTS = ['Code client', 'Nom / Raison sociale', 'Ville', 'Type', 'Traité par', 'Statut de l\'appel', 'Client actif ?', 'Produits achetés', 'E-mail confirmé', 'Téléphone confirmé', 'Doublon du n°', 'Motif de sortie', 'À rappeler le', 'Notes', 'Dernière mise à jour'];
  H.exportClients = function (suivi, parCode, colCode) {
    return suivi.map(function (s) {
      var c = parCode.get(String(s.code_client)) || {};
      return [s.code_client, c['Raison sociale / Nom'] || '', c.Ville || '', c['Type client'] || '', s.traite_par || 'Non traité', s.statut || '', s.existe || '', H.texte(s.produits).split('|').join(', '),
        s.email_maj || '', s.tel_maj || '', s.doublon_de || '', s.motif_sortie || '', H.jolieDate(s.rappel_date), s.note || '', H.heureParis(s.maj_le, true)];
    });
  };
  H.COLONNES_EXPORT_ADRESSES = ['Code adresse', 'Code client mère', 'Nom du site', 'Code postal', 'Ville', 'Vérifié par', 'Référent sur place', 'Tél. référent / site', 'Statut vérification', 'Note', 'Dernière mise à jour'];
  H.exportAdresses = function (adresses, suiviAdr) {
    return adresses.map(function (a) {
      var s = suiviAdr.get(a['Code adresse']) || {};
      return [a['Code adresse'], a['Code client mère'], a['Nom site'], a['Code postal'], a.Ville, s.traite_par || 'Non traité', s.referent || '', s.tel_site || '', s.statut_adr || 'À vérifier', s.note_adr || '', H.heureParis(s.maj_le, true)];
    });
  };

  /* ------------------------------------------------------------------ CSV de restauration (ancien format d'export) */
  H.lireCsv = function (texte) {
    var t = String(texte).replace(/^﻿/, ''), premiere = t.split(/\r?\n/)[0] || '';
    var sep = (premiere.split(';').length - 1) >= (premiere.split(',').length - 1) ? ';' : ',';
    var lignes = [], champ = '', ligne = [], guillemets = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (guillemets) { if (c === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; } else champ += c; }
      else if (c === '"') guillemets = true;
      else if (c === sep) { ligne.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; ligne.push(champ); champ = ''; if (ligne.length > 1 || ligne[0] !== '') lignes.push(ligne); ligne = []; }
      else champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    if (!lignes.length) return [];
    var cols = lignes[0].map(function (x) { return x.trim(); });
    return lignes.slice(1).map(function (l) { var o = {}; cols.forEach(function (c, i) { o[c] = (l[i] || '').trim(); }); return o; });
  };
  function valeurCsv(ligne, colonne) { var v = colonne ? H.texte(ligne[colonne]).trim() : ''; return H.LIBELLES_VIDES.indexOf(v) >= 0 ? '' : v; }
  H.lignesRestaurationClients = function (rows) {
    if (!rows.length) return [];
    var cols = Object.keys(rows[0]), t = function () { return H.trouverColonne(cols, [].slice.call(arguments)); };
    var m = { code: t('code_client', 'code client'), statut: t('statut', 'statut de l\'appel'), existe: t('existe', 'client actif ?'), produits: t('produits', 'produits achetés'), email_maj: t('email_maj', 'e-mail confirmé'), tel_maj: t('tel_maj', 'téléphone confirmé'), doublon_de: t('doublon_de', 'doublon du n°'), motif_sortie: t('motif_sortie', 'motif de sortie'), rappel_date: t('rappel_date', 'à rappeler le'), note: t('note', 'notes'), traite_par: t('traite_par', 'traité par', 'traitée par') };
    if (!m.code) throw new Error('Le fichier doit contenir une colonne « code_client ».');
    var res = [];
    rows.forEach(function (r) {
      var code = valeurCsv(r, m.code); if (!code) return;
      var produits = valeurCsv(r, m.produits).replace(/;/g, ',').split(',').map(function (x) { return x.trim(); }).filter(Boolean).join('|');
      res.push({ code: code, traite_par: valeurCsv(r, m.traite_par), champs: { statut: valeurCsv(r, m.statut) || 'À appeler', existe: valeurCsv(r, m.existe), produits: produits, email_maj: valeurCsv(r, m.email_maj), tel_maj: valeurCsv(r, m.tel_maj), doublon_de: valeurCsv(r, m.doublon_de), motif_sortie: valeurCsv(r, m.motif_sortie), note: valeurCsv(r, m.note), rappel_date: H.versIso(valeurCsv(r, m.rappel_date)) } });
    });
    return res;
  };
  H.lignesRestaurationAdresses = function (rows) {
    if (!rows.length) return [];
    var cols = Object.keys(rows[0]), t = function () { return H.trouverColonne(cols, [].slice.call(arguments)); };
    var m = { code: t('code_adresse', 'code adresse'), referent: t('referent', 'référent sur place'), tel_site: t('tel_site', 'tél. référent / site', 'tel. référent / site'), statut_adr: t('statut_adr', 'statut vérification'), note_adr: t('note_adr', 'note'), traite_par: t('traite_par', 'vérifié par', 'traité par') };
    if (!m.code) throw new Error('Le fichier doit contenir une colonne « code_adresse ».');
    var res = [];
    rows.forEach(function (r) {
      var code = valeurCsv(r, m.code); if (!code) return;
      var c = { referent: valeurCsv(r, m.referent), tel_site: valeurCsv(r, m.tel_site), statut_adr: valeurCsv(r, m.statut_adr) || 'À vérifier', note_adr: valeurCsv(r, m.note_adr) };
      var tp = valeurCsv(r, m.traite_par);
      // Une ligne sans aucune saisie ne crée pas d'enregistrement (l'export contient tous les sites du classeur).
      if (!c.referent && !c.tel_site && !c.note_adr && !tp && (c.statut_adr === '' || c.statut_adr === 'À vérifier')) return;
      res.push({ code: code, traite_par: tp, champs: c });
    });
    return res;
  };

  /* ------------------------------------------------------------------ import d'un classeur (feuilles « Clients » et « Adresses livraison ») : mêmes règles que l'ancien outil */
  function renommer(cols, map) { return cols.map(function (c) { return Object.prototype.hasOwnProperty.call(map, c) ? map[c] : c; }); }
  function garderPremieres(cols, lignes) {
    var vus = {}, idx = [];
    cols.forEach(function (c, i) { if (!(c in vus) && !/^—.*—$/.test(String(c).trim())) { vus[c] = 1; idx.push(i); } });   // doublons écartés (le premier est conservé), séparateurs « — … — » ignorés
    return { colonnes: idx.map(function (i) { return cols[i]; }), lignes: lignes.map(function (l) { return idx.map(function (i) { return l[i] === undefined || l[i] === null ? '' : String(l[i]); }); }) };
  }
  function completer(t, requises) {
    requises.forEach(function (c) { if (t.colonnes.indexOf(c) < 0) { t.colonnes.push(c); t.lignes.forEach(function (l) { l.push(''); }); } });
    return t;
  }
  H.normaliserClasseur = function (colsC, lignesC, colsA, lignesA) {
    var colCode = H.trouverColonne(colsC, ['code client', 'code_client']), renoms = {};
    [[['raison sociale / nom', 'nom', 'raison sociale'], 'Raison sociale / Nom'], [['type client', 'type'], 'Type client'], [['ville'], 'Ville'], [['catégorie normalisée', 'catégorie', 'categorie'], 'Catégorie'], [['siren (9 chiffres)', 'siren', 'siren / siret'], 'SIREN'], [['code postal', 'code_postal'], 'Code postal']].forEach(function (x) {
      var c = H.trouverColonne(colsC, x[0]); if (c && c !== x[1]) renoms[c] = x[1];
    });
    [1, 2, 3].forEach(function (n) { var c = H.trouverColonne(colsC, ['téléphone ' + n + ' (norm)', 'téléphone ' + n, 'telephone ' + n]); if (c && c !== 'Téléphone ' + n) renoms[c] = 'Téléphone ' + n; });
    var clients = completer(garderPremieres(renommer(colsC, renoms), lignesC), ['Raison sociale / Nom', 'Type client', 'Ville', 'Catégorie', 'À compléter', 'Email principal', 'Email secondaire', 'SIREN', 'Téléphone 1', 'Téléphone 2', 'Téléphone 3', 'Adresse 1', 'Adresse 2', 'Adresse 3', 'Code postal']);
    var adr = { colonnes: [], lignes: [] };
    if (colsA && colsA.length) {
      var cols = colsA.slice(), r = H.trouverColonne(cols, ['code client mère', 'code client mere']);
      if (r && r !== 'Code client mère') { var m1 = {}; m1[r] = 'Code client mère'; cols = renommer(cols, m1); }
      if (cols.indexOf('Code adresse') < 0) { var c = H.trouverColonne(cols, ['code adresse']) || H.trouverColonne(cols, ['code client']); if (c) { var m2 = {}; m2[c] = 'Code adresse'; cols = renommer(cols, m2); } }
      [[['téléphone 1 (norm)', 'téléphone 1', 'telephone 1'], 'Téléphone'], [['code postal'], 'Code postal'], [['nom site', 'nom'], 'Nom site']].forEach(function (x) {
        var c2 = H.trouverColonne(cols, x[0]); if (c2 && c2 !== x[1] && cols.indexOf(x[1]) < 0) { var m3 = {}; m3[c2] = x[1]; cols = renommer(cols, m3); }
      });
      adr = completer(garderPremieres(cols, lignesA), ['Code adresse', 'Code client mère', 'Nom site', 'Adresse 1', 'Adresse 2', 'Adresse 3', 'Code postal', 'Ville', 'Téléphone']);
    }
    var jc = clients.colonnes.indexOf(colCode);
    clients.lignes = clients.lignes.filter(function (l) { return jc >= 0 && String(l[jc]).trim() !== ''; });
    var ja = adr.colonnes.indexOf('Code adresse'); adr.lignes = adr.lignes.filter(function (l) { return ja >= 0 && String(l[ja]).trim() !== ''; });
    return { colCode: colCode, clients: clients, adresses: adr };
  };

  return H;
});
