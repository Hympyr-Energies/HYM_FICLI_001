// Fonction Edge « fificli-api » : passerelle entre le cockpit appels (navigateur) et Supabase.
//
// - Les membres sont des comptes Supabase Authentication (mot de passe administré dans Supabase) listés dans
//   public.fificli_membres avec leur nom affiché (= valeur « traite_par » des fiches) et leur rôle.
// - La connexion se fait au portail Hympyr (session supabase-js commune) ; la page envoie le jeton de cette session. Les données
//   passent par cette fonction, qui détient les clés (SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY, fournies par l'environnement).
//   Les actions login, refresh et recover restent disponibles mais ne sont plus utilisées par la page.
// - Chaque requête de données porte le jeton du membre ; la fonction le valide auprès de Supabase Auth, vérifie
//   l'appartenance à fificli_membres (actif) puis applique les droits du rôle avant toute lecture ou écriture.
//
// Rôles : commercial (appels, points de livraison, export), manager (pilotage en lecture seule + réinitialisation),
//         admin (tout, sauf la réinitialisation).
//
// Contrat : POST JSON { action, ... } ; jeton dans « Authorization: Bearer … » pour tout sauf login, refresh et recover.
//   login {email,password} · refresh {refresh_token} · recover {email} · password {password}
//   bootstrap {classeur:{clients,adresses}} · delta {since,since_adr} · fiche_enregistrer · adresse_enregistrer
//   reattribuer · presence · export_confirmer · rapport {jours} · reinitialiser {confirmation}
//   ticket_creer · ticket_lister · ticket_maj · classeur_ajouter · classeur_publier · restaurer
//   Erreurs : 400 requête invalide · 401 identifiants/jeton · 403 droits insuffisants · 502 base injoignable.

// Origines autorisées : celle des outils Hympyr (GitHub Pages de l'organisation Hympyr-Energies), plus celles de la variable
// FIFICLI_ALLOWED_ORIGIN (liste séparée par des virgules). L'en-tête CORS renvoie l'origine de la requête si elle est autorisée.
const ORIGINE = "https://hympyr-energies.github.io";
const ORIGINES = new Set([ORIGINE, ...(Deno.env.get("FIFICLI_ALLOWED_ORIGIN") ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)]);
const origineDe = (req: Request) => { const o = req.headers.get("origin") ?? ""; return ORIGINES.has(o) ? o : ORIGINE; };
const SITE_URL = Deno.env.get("FIFICLI_SITE_URL") ?? "https://hympyr-energies.github.io/portail/";
const TAILLE_MAX = 8 * 1024 * 1024;

const ENV = {
  url: (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, ""),
  anon: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  serveur: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
};

const STATUTS = ["À appeler", "À rappeler", "Injoignable", "Boudret", "Fait ✅", "Doublon", "Ancien client (à sortir)"];
const STATUTS_ADRESSE = ["À vérifier", "Vérifié ✅", "Adresse obsolète"];
const EXISTE = ["", "Oui", "Non", "Incertain"];
const TYPES_TICKET = ["probleme", "suggestion", "question"];
const STATUTS_TICKET = ["nouveau", "en_cours", "traite", "clos"];
const VERROU_MINUTES = 12;

type Membre = { email: string; nom: string; role: "commercial" | "manager" | "admin" };

const entetes = (extra: Record<string, string> = {}) => ({
  "Access-Control-Allow-Origin": ORIGINE,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  ...extra,
});
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: entetes({ "Content-Type": "application/json" }) });
const reponseBrute = (texte: string, statut = 200) =>
  new Response(texte, { status: statut, headers: entetes({ "Content-Type": "application/json" }) });
const refus = (code: string, message: string, statut: number) => reponse({ code, message }, statut);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = encodeURIComponent;

const auth = (chemin: string, init: RequestInit = {}, jeton?: string) =>
  fetch(`${ENV.url}/auth/v1${chemin}`, {
    ...init, redirect: "manual",
    headers: { apikey: ENV.anon, "Content-Type": "application/json", ...(jeton ? { Authorization: "Bearer " + jeton } : {}), ...(init.headers ?? {}) },
  });
const rest = (chemin: string, init: RequestInit = {}) =>
  fetch(`${ENV.url}/rest/v1${chemin}`, {
    ...init, redirect: "manual",
    headers: { apikey: ENV.serveur, Authorization: "Bearer " + ENV.serveur, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
const rpc = (nom: string, args: unknown) => rest(`/rpc/${nom}`, { method: "POST", body: JSON.stringify(args) });

/** Lecture complète d'une table (PostgREST plafonne à 1000 lignes par requête). */
async function tout(chemin: string, ordre: string): Promise<any[]> {
  const sortie: any[] = [];
  const sep = chemin.includes("?") ? "&" : "?";
  for (let debut = 0; ; debut += 1000) {
    const r = await rest(`${chemin}${sep}order=${ordre}&limit=1000&offset=${debut}`);
    if (!r.ok) throw new Error(`lecture ${chemin} : HTTP ${r.status}`);
    const l = await r.json();
    sortie.push(...l);
    if (l.length < 1000) break;
  }
  return sortie;
}
async function compter(table: string): Promise<number> {
  const r = await rest(`/${table}?select=*&limit=1`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
  await r.body?.cancel();
  return m ? Number(m[1]) : -1;
}
const jourUtc = () => new Date().toISOString().slice(0, 10);
const maintenantUtc = () => new Date().toISOString().slice(0, 19);

/* ------------------------------------------------------------------ appartenance */
const cacheJetons = new Map<string, { membre: Membre; jusqua: number }>();

async function membre(email: string | undefined): Promise<Membre | null> {
  if (!email) return null;
  const r = await rest(`/fificli_membres?email=eq.${q(email.toLowerCase())}&actif=eq.true&select=email,nom,role&limit=1`);
  if (!r.ok) throw new Error("membres");
  const l = await r.json();
  return Array.isArray(l) && l.length === 1 ? l[0] : null;
}

/** Valide le jeton auprès de Supabase Auth puis l'appartenance. -> membre ou Response d'erreur. */
async function authentifier(req: Request): Promise<Membre | Response> {
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return refus("auth", "Connexion requise.", 401);
  const en_cache = cacheJetons.get(jeton);
  if (en_cache && en_cache.jusqua > Date.now()) return en_cache.membre;
  const r = await auth("/user", { method: "GET" }, jeton);
  if (!r.ok) return refus("auth", "Session expirée : reconnectez-vous.", 401);
  const u = await r.json();
  if (!u?.email || (!u?.email_confirmed_at && !u?.confirmed_at)) return refus("auth", "Compte non confirmé.", 401);
  const m = await membre(u.email);
  if (!m) return refus("membre", "Ce compte n'est pas autorisé à utiliser le cockpit.", 403);
  if (cacheJetons.size > 200) cacheJetons.clear();
  cacheJetons.set(jeton, { membre: m, jusqua: Date.now() + 20_000 });
  return m;
}

const session = (s: any, m: Membre) => ({
  access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in,
  email: m.email, nom: m.nom, role: m.role,
});
const peutTraiter = (m: Membre) => m.role === "commercial" || m.role === "admin";
const peutPiloter = (m: Membre) => m.role === "manager" || m.role === "admin";
const interdit = () => refus("droits", "Votre profil ne permet pas cette action.", 403);
const texte = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

/* ------------------------------------------------------------------ données communes */
async function etatCommun(m: Membre, depuis?: { suivi: string; adr: string }) {
  const filtre = (cle: string, v?: string) => (v ? `&${cle}=gt.${q(v)}` : "");
  const limiteVerrou = new Date(Date.now() - VERROU_MINUTES * 60_000).toISOString().slice(0, 19);
  const [suivi, adresses, verrous, appelsJour, exp, derniere] = await Promise.all([
    tout(`/suivi?select=*${filtre("maj_le", depuis?.suivi)}`, "code_client"),
    tout(`/suivi_adresses?select=*${filtre("maj_le", depuis?.adr)}`, "code_adresse"),
    rest(`/verrous?select=type_fiche,code,utilisateur,depuis&depuis=gte.${q(limiteVerrou)}&utilisateur=neq.${q(m.nom)}`).then((r) => (r.ok ? r.json() : [])),
    tout(`/appels?select=utilisateur,type_fiche,code&jour=eq.${jourUtc()}&origine=eq.appel`, "id"),
    rest(`/meta?cle=eq.dernier_export&select=valeur&limit=1`).then((r) => (r.ok ? r.json() : [])),
    rest(`/meta?cle=eq.${q("derniere_fiche_" + m.nom)}&select=valeur&limit=1`).then((r) => (r.ok ? r.json() : [])),
  ]);
  // Clients distincts appelés aujourd'hui, par personne et par type de fiche.
  const vus = new Set<string>();
  const compteurs: Record<string, number> = {};
  for (const a of appelsJour) {
    const k = `${a.utilisateur}|${a.type_fiche}|${a.code}`;
    if (vus.has(k)) continue;
    vus.add(k);
    const c = `${a.utilisateur}|${a.type_fiche}`;
    compteurs[c] = (compteurs[c] ?? 0) + 1;
  }
  return {
    suivi, suivi_adresses: adresses, verrous, compteurs,
    dernier_export: exp?.[0]?.valeur ?? "", derniere_fiche: derniere?.[0]?.valeur ?? "",
  };
}

async function traiter(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes() });
  if (req.method !== "POST") return refus("methode", "POST uniquement.", 405);
  if (!ENV.url.startsWith("https://") || !ENV.anon || !ENV.serveur) return refus("config", "Configuration serveur incomplète.", 500);

  const brut = await req.text();
  if (brut.length > TAILLE_MAX) return refus("taille", "Document trop volumineux.", 413);
  let c: any;
  try { c = JSON.parse(brut); } catch { return refus("requete", "JSON invalide.", 400); }

  try {
    /* ---------- accès sans jeton ---------- */
    if (c.action === "login") {
      if (typeof c.email !== "string" || typeof c.password !== "string" || !c.email || !c.password) return refus("requete", "E-mail et mot de passe requis.", 400);
      const r = await auth("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: c.email.trim().toLowerCase(), password: c.password }) });
      const s = r.ok ? await r.json() : null;
      const m = s ? await membre(s.user?.email) : null;
      if (!s || !m) { await pause(1000); return refus("auth", "Identifiants incorrects.", 401); }   // même message : on ne révèle pas si le compte existe
      return reponse(session(s, m));
    }
    if (c.action === "refresh") {
      if (typeof c.refresh_token !== "string" || !c.refresh_token) return refus("auth", "Session expirée.", 401);
      const r = await auth("/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: c.refresh_token }) });
      const s = r.ok ? await r.json() : null;
      const m = s ? await membre(s.user?.email) : null;
      if (!s || !m) return refus("auth", "Session expirée : reconnectez-vous.", 401);
      return reponse(session(s, m));
    }
    if (c.action === "recover") {
      if (typeof c.email === "string" && c.email.includes("@")) {
        const m = await membre(c.email.trim().toLowerCase());
        if (m) {
          const qs = SITE_URL ? "?redirect_to=" + encodeURIComponent(SITE_URL) : "";
          await auth("/recover" + qs, { method: "POST", body: JSON.stringify({ email: m.email }) });
        } else await pause(400);
      }
      return reponse({ ok: true });                                      // réponse identique dans tous les cas
    }

    /* ---------- accès avec jeton de membre ---------- */
    const m = await authentifier(req);
    if (m instanceof Response) return m;
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

    if (c.action === "password") {
      if (typeof c.password !== "string" || c.password.length < 10) return refus("requete", "Le mot de passe doit contenir au moins 10 caractères.", 400);
      const r = await auth("/user", { method: "PUT", body: JSON.stringify({ password: c.password }) }, jeton);
      if (!r.ok) { const e = await r.json().catch(() => ({})); return refus("mdp", e?.msg ?? e?.message ?? "Mot de passe refusé par Supabase.", 400); }
      return reponse({ ok: true });
    }

    /* ----- chargement initial : membres, classeur (si nouvelle version), suivi, présence ----- */
    if (c.action === "bootstrap") {
      const dispo = await rest(`/fificli_classeur?cle=in.(clients,adresses)&select=cle,version`).then((r) => (r.ok ? r.json() : []));
      const version = (cle: string) => dispo.find((x: any) => x.cle === cle)?.version ?? 0;
      const morceauClasseur = async (cle: string) => {
        const v = version(cle);
        if (!v) return `{"absent":true}`;
        if (Number(c.classeur?.[cle]) === v) return `{"inchange":true,"version":${v}}`;
        // Texte brut recopié tel quel : évite de décoder puis ré-encoder plusieurs mégaoctets.
        const r = await rest(`/fificli_classeur?cle=eq.${cle}&select=version,nom_fichier,importe_le,importe_par,colonnes,lignes`,
          { headers: { Accept: "application/vnd.pgrst.object+json" } });
        if (!r.ok) throw new Error("classeur " + cle);
        return await r.text();
      };
      const [membres, clients, adresses, commun] = await Promise.all([
        rest(`/fificli_membres?actif=eq.true&select=nom,role&order=nom`).then((r) => (r.ok ? r.json() : [])),
        morceauClasseur("clients"), morceauClasseur("adresses"), etatCommun(m),
      ]);
      return reponseBrute(
        `{"serveur_le":${JSON.stringify(maintenantUtc())},"moi":${JSON.stringify(m)},"membres":${JSON.stringify(membres)},` +
        `"classeur":{"clients":${clients},"adresses":${adresses}},"commun":${JSON.stringify(commun)}}`,
      );
    }

    /* ----- actualisation légère : seulement ce qui a changé depuis le dernier chargement ----- */
    if (c.action === "delta") {
      const commun = await etatCommun(m, { suivi: texte(c.since, 30), adr: texte(c.since_adr, 30) });
      const [n_suivi, n_adr] = await Promise.all([compter("suivi"), compter("suivi_adresses")]);
      return reponse({ serveur_le: maintenantUtc(), commun, n_suivi, n_adr });
    }

    /* ----- saisie ----- */
    if (c.action === "fiche_enregistrer") {
      if (!peutTraiter(m)) return interdit();
      const code = texte(c.code, 80).trim();
      const ch = c.champs ?? {};
      if (!code || typeof ch !== "object") return refus("requete", "Fiche invalide.", 400);
      if (ch.statut !== undefined && !STATUTS.includes(ch.statut)) return refus("requete", "Statut inconnu.", 400);
      if (ch.existe !== undefined && !EXISTE.includes(ch.existe)) return refus("requete", "Valeur « client actif » inconnue.", 400);
      const efface = Array.isArray(c.effacements) ? c.effacements.filter((x: unknown) => typeof x === "string").slice(0, 20) : [];
      const r = await rpc("fificli_enregistrer_fiche", { p_code: code, p_utilisateur: m.nom, p_champs: ch, p_effacements: efface, p_journaliser: true });
      if (!r.ok) { console.error("fiche_enregistrer", r.status, await r.text()); return refus("base", "Enregistrement impossible.", 502); }
      return reponse({ fiche: await r.json(), serveur_le: maintenantUtc() });
    }
    if (c.action === "adresse_enregistrer") {
      if (!peutTraiter(m)) return interdit();
      const code = texte(c.code, 80).trim();
      const ch = c.champs ?? {};
      if (!code || typeof ch !== "object") return refus("requete", "Point de livraison invalide.", 400);
      if (ch.statut_adr !== undefined && !STATUTS_ADRESSE.includes(ch.statut_adr)) return refus("requete", "Statut inconnu.", 400);
      const efface = Array.isArray(c.effacements) ? c.effacements.filter((x: unknown) => typeof x === "string").slice(0, 20) : [];
      const r = await rpc("fificli_enregistrer_adresse", { p_code: code, p_utilisateur: m.nom, p_champs: ch, p_effacements: efface, p_journaliser: true });
      if (!r.ok) { console.error("adresse_enregistrer", r.status, await r.text()); return refus("base", "Enregistrement impossible.", 502); }
      return reponse({ fiche: await r.json(), serveur_le: maintenantUtc() });
    }
    if (c.action === "reattribuer") {
      if (m.role !== "admin") return interdit();
      const code = texte(c.code, 80).trim();
      const statut = texte(c.statut, 60);
      const traitant = texte(c.traitant, 80);
      if (!code || !STATUTS.includes(statut)) return refus("requete", "Réattribution invalide.", 400);
      if (traitant) {
        const l = await rest(`/fificli_membres?nom=eq.${q(traitant)}&actif=eq.true&role=in.(commercial,admin)&select=nom&limit=1`).then((r) => r.json());
        if (!Array.isArray(l) || l.length !== 1) return refus("requete", "Personne inconnue.", 400);
      }
      const r = await rpc("fificli_reattribuer", { p_code: code, p_traitant: traitant, p_statut: statut, p_auteur: m.nom });
      if (!r.ok) { console.error("reattribuer", r.status, await r.text()); return refus("base", "Modification impossible.", 502); }
      return reponse({ fiche: await r.json() });
    }
    if (c.action === "presence") {
      if (!peutTraiter(m)) return interdit();
      const type = c.type === "adresse" ? "adresse" : "client";
      const code = texte(c.code, 80).trim();
      if (!code) return refus("requete", "Code manquant.", 400);
      const r = await rpc("fificli_poser_verrou", { p_type: type, p_code: code, p_utilisateur: m.nom });
      if (!r.ok) { console.error("presence", r.status, await r.text()); return refus("base", "Présence non enregistrée.", 502); }
      return reponse({ ok: true });
    }
    if (c.action === "export_confirmer") {
      if (!peutTraiter(m)) return interdit();
      const maintenant = maintenantUtc();
      const r = await rest(`/meta?on_conflict=cle`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ cle: "dernier_export", valeur: maintenant }]) });
      if (!r.ok) return refus("base", "Confirmation impossible.", 502);
      return reponse({ dernier_export: maintenant });
    }

    /* ----- pilotage ----- */
    if (c.action === "rapport") {
      if (!peutPiloter(m)) return interdit();
      const jours = Math.max(1, Math.min(Number(c.jours) || 30, 365));
      const depuis = new Date(Date.now() - (jours - 1) * 86_400_000).toISOString().slice(0, 10);
      const [appels, journal] = await Promise.all([
        tout(`/appels?select=jour,utilisateur,type_fiche,code,statut,origine,horodatage&jour=gte.${depuis}`, "id"),
        rest(`/journal?select=horodatage,auteur,action,cible,detail&order=id.desc&limit=200`).then((r) => (r.ok ? r.json() : [])),
      ]);
      return reponse({ depuis, appels, journal });
    }
    if (c.action === "reinitialiser") {
      if (m.role !== "manager") return interdit();
      if (c.confirmation !== "RESET") return refus("requete", "Confirmation manquante.", 400);
      const r = await rpc("fificli_reinitialiser", { p_auteur: m.nom });
      if (!r.ok) { console.error("reinitialiser", r.status, await r.text()); return refus("base", "Réinitialisation impossible.", 502); }
      return reponse({ ok: true });
    }

    /* ----- tickets ----- */
    if (c.action === "ticket_creer") {
      const type = texte(c.type, 20);
      const sujet = texte(c.sujet, 140).trim();
      const message = texte(c.message, 4000).trim();
      if (!TYPES_TICKET.includes(type)) return refus("requete", "Type de ticket inconnu.", 400);
      if (sujet.length < 3) return refus("requete", "Le sujet est trop court.", 400);
      if (message.length < 3) return refus("requete", "Le message est trop court.", 400);
      const contexte = c.contexte && typeof c.contexte === "object" ? c.contexte : {};
      if (JSON.stringify(contexte).length > 3000) return refus("requete", "Contexte trop volumineux.", 400);
      // Garde-fou : 12 tickets par heure et par personne.
      const depuis = new Date(Date.now() - 3_600_000).toISOString();
      const deja = await rest(`/fificli_tickets?auteur_email=eq.${q(m.email)}&cree_le=gte.${q(depuis)}&select=id`, { headers: { Prefer: "count=exact", Range: "0-0" } });
      const n = Number(/\/(\d+)$/.exec(deja.headers.get("content-range") ?? "")?.[1] ?? 0);
      await deja.body?.cancel();
      if (n >= 12) return refus("limite", "Trop de tickets envoyés en peu de temps. Réessayez plus tard.", 429);
      const r = await rest(`/fificli_tickets`, {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ auteur_email: m.email, auteur_nom: m.nom, type, sujet, message, page: texte(c.page, 60), contexte }),
      });
      if (!r.ok) { console.error("ticket_creer", r.status, await r.text()); return refus("base", "Le ticket n'a pas pu être enregistré.", 502); }
      const [t] = await r.json();
      return reponse({ id: t.id, cree_le: t.cree_le });
    }
    if (c.action === "ticket_lister") {
      const filtre = peutPiloter(m) ? "" : `&auteur_email=eq.${q(m.email)}`;
      const r = await rest(`/fificli_tickets?select=id,cree_le,auteur_nom,type,sujet,message,page,statut,reponse,traite_par,maj_le&order=cree_le.desc&limit=200${filtre}`);
      if (!r.ok) return refus("base", "Lecture impossible.", 502);
      return reponse({ tickets: await r.json(), tous: peutPiloter(m) });
    }
    if (c.action === "ticket_maj") {
      if (!peutPiloter(m)) return interdit();
      const id = Number(c.id);
      const corps: Record<string, unknown> = { maj_le: new Date().toISOString(), traite_par: m.nom };
      if (c.statut !== undefined) { if (!STATUTS_TICKET.includes(c.statut)) return refus("requete", "Statut inconnu.", 400); corps.statut = c.statut; }
      if (c.reponse !== undefined) corps.reponse = texte(c.reponse, 4000);
      if (!Number.isInteger(id)) return refus("requete", "Ticket inconnu.", 400);
      const r = await rest(`/fificli_tickets?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(corps) });
      if (!r.ok) return refus("base", "Mise à jour impossible.", 502);
      return reponse({ ok: true });
    }

    /* ----- administration des données (profil admin) ----- */
    if (c.action === "classeur_ajouter") {
      if (m.role !== "admin") return interdit();
      const cle = c.cle === "adresses" ? "adresses_import" : c.cle === "clients" ? "clients_import" : "";
      if (!cle || !Array.isArray(c.lignes) || !Array.isArray(c.colonnes) || c.lignes.length > 1500) return refus("requete", "Import invalide.", 400);
      const r = await rpc("fificli_classeur_ajouter", { p_cle: cle, p_colonnes: c.colonnes, p_lignes: c.lignes, p_nom: texte(c.nom, 200), p_auteur: m.nom, p_debut: !!c.debut });
      if (!r.ok) { console.error("classeur_ajouter", r.status, await r.text()); return refus("base", "Import impossible.", 502); }
      return reponse({ recues: await r.json() });
    }
    if (c.action === "classeur_publier") {
      if (m.role !== "admin") return interdit();
      const cle = c.cle === "adresses" ? "adresses_import" : c.cle === "clients" ? "clients_import" : "";
      if (!cle || !Number.isInteger(c.attendu)) return refus("requete", "Import invalide.", 400);
      const r = await rpc("fificli_classeur_publier", { p_cle: cle, p_attendu: c.attendu });
      if (!r.ok) { console.error("classeur_publier", r.status, await r.text()); return refus("base", "Publication impossible : import incomplet.", 502); }
      return reponse({ version: await r.json() });
    }
    if (c.action === "restaurer") {
      // Restauration depuis un export CSV (la saisie du fichier fait foi, y compris les champs vides).
      if (m.role !== "admin") return interdit();
      const lignes = Array.isArray(c.lignes) ? c.lignes.slice(0, 300) : [];
      const type = c.type === "adresse" ? "adresse" : "client";
      let n = 0;
      for (const l of lignes) {
        const code = texte(l?.code, 80).trim();
        if (!code) continue;
        const traite = texte(l?.traite_par, 80);
        const champs = l?.champs ?? {};
        const efface = type === "client"
          ? ["existe", "produits", "email_maj", "tel_maj", "note", "doublon_de", "rappel_date", "motif_sortie", "traite_par"]
          : ["referent", "tel_site", "note_adr", "traite_par"];
        const r = await rpc(type === "client" ? "fificli_enregistrer_fiche" : "fificli_enregistrer_adresse",
          { p_code: code, p_utilisateur: traite, p_champs: champs, p_effacements: efface, p_journaliser: false });
        if (!r.ok) { console.error("restaurer", r.status, await r.text()); return refus("base", `Restauration interrompue après ${n} ligne(s).`, 502); }
        n++;
      }
      return reponse({ restaurees: n });
    }

    return refus("requete", "Action inconnue.", 400);
  } catch (e) {
    console.error("fificli-api", e);
    return refus("base", "Service injoignable.", 502);
  }
}

Deno.serve(async (req) => {
  const r = await traiter(req);
  r.headers.set("Access-Control-Allow-Origin", origineDe(req));
  return r;
});
