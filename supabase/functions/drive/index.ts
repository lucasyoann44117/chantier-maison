// Pont entre l'application et le Google Drive du foyer.
// Le compte Google est relié une seule fois (bouton « Relier le Drive ») :
// ensuite les fichiers passent par ici, et personne n'a à se connecter à Google.
// L'accès se limite aux fichiers créés par l'application (droit drive.file).
//
// Déploiement : Supabase > Edge Functions, fonction « drive », avec
// « Verify JWT » désactivé (Google rappelle cette adresse sans jeton) ;
// la fonction vérifie elle-même que l'appelant est du foyer.
// Secrets : GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_PROJET = Deno.env.get('SUPABASE_URL')!;
const CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const ICI = `${URL_PROJET}/functions/v1/drive`;
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const ENVOI = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

// Adresses où renvoyer après l'autorisation Google.
const RETOURS = [/^https:\/\/lucasyoann44117\.github\.io\//, /^http:\/\/localhost(:\d+)?\//];
// Un sous-dossier par type, sous « Chantier maison ».
const DOSSIERS: Record<string, string> = {
  devis: 'Devis', facture: 'Factures', plan: 'Plans', photo: 'Photos', banque: 'Banque', autre: 'Autres', sauvegardes: 'Sauvegardes',
};
const TABLES = ['postes', 'devis', 'devis_historique', 'factures', 'taches', 'relances', 'reglages', 'documents', 'prets'];
const SEMAINE = 7 * 86400000;
const TAILLE_MAX = 25e6;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

class Erreur extends Error {
  constructor(message: string, public statut = 400) { super(message); }
}

const json = (v: unknown, statut = 200) =>
  new Response(JSON.stringify(v), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(URL_PROJET, CLE_SERVICE, { auth: { persistSession: false } });

type Connexion = {
  refresh_token: string | null;
  dossiers: Record<string, string> | null;
  etat: string | null;
  etat_le: string | null;
  retour: string | null;
  derniere_sauvegarde: string | null;
};

async function connexion(): Promise<Connexion | null> {
  const { data, error } = await admin.from('drive_connexion').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function majConnexion(champs: Partial<Connexion>) {
  const { error } = await admin.from('drive_connexion')
    .upsert({ id: 1, ...champs, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Client au nom de l'appelant : les règles d'accès (RLS) s'appliquent.
async function duFoyer(req: Request) {
  const sb = createClient(URL_PROJET, CLE_ANON, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc('est_du_foyer');
  if (error || !data) throw new Erreur('Accès refusé', 401);
  return sb;
}

async function jetonGoogle(c: Connexion | null) {
  if (!c?.refresh_token) throw new Erreur('Le Drive n\'est pas relié.', 409);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: c.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) {
    // Autorisation retirée côté Google : il faudra relier le Drive à nouveau.
    if (d.error === 'invalid_grant') await majConnexion({ refresh_token: null });
    throw new Erreur('Accès au Drive refusé : relier le Drive à nouveau.', 409);
  }
  return d.access_token as string;
}

async function google(acces: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${acces}`, ...init.headers } });
  if (!r.ok) {
    // Google répond par un long JSON : on n'en garde que la phrase utile.
    const texte = await r.text();
    let detail = texte;
    try { detail = JSON.parse(texte).error.message; } catch { /* réponse non JSON */ }
    throw new Erreur(`Drive (${r.status}) : ${detail.split(/\. /)[0].slice(0, 200)}`, r.status === 404 ? 404 : 502);
  }
  return r;
}

async function creerDossier(acces: string, nom: string, parent?: string) {
  const r = await google(acces, `${DRIVE}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
  });
  return (await r.json()).id as string;
}

// Dossier « Chantier maison » et ses sous-dossiers, créés au premier besoin.
async function dossier(acces: string, c: Connexion, cle: string) {
  const d = { ...(c.dossiers ?? {}) };
  const avant = JSON.stringify(d);
  d.racine ??= await creerDossier(acces, 'Chantier maison');
  d[cle] ??= await creerDossier(acces, DOSSIERS[cle], d.racine);
  if (JSON.stringify(d) !== avant) {
    c.dossiers = d;
    await majConnexion({ dossiers: d });
  }
  return d[cle];
}

async function deposer(acces: string, nom: string, mime: string, parent: string, contenu: Blob | string) {
  const limite = `chantier-${crypto.randomUUID()}`;
  const corps = new Blob([
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nom, parents: [parent] })}\r\n`,
    `--${limite}\r\nContent-Type: ${mime}\r\n\r\n`, contenu, `\r\n--${limite}--`,
  ]);
  const r = await google(acces, ENVOI, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corps,
  });
  return (await r.json()).id as string;
}

// Retour de Google après « Relier le Drive » : on garde le jeton durable.
async function retourGoogle(p: URLSearchParams) {
  const c = await connexion();
  const valide = c?.etat && p.get('state') === c.etat && Date.now() - Date.parse(c.etat_le ?? '') < 15 * 60000;
  if (!valide || !c?.retour) return new Response('Lien expiré : recommencer depuis l\'application.', { status: 400 });
  const vers = (fin: string) => Response.redirect(`${c.retour}#documents${fin}`, 302);
  if (!p.get('code')) {
    await majConnexion({ etat: null });
    return vers('/drive-annule');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code: p.get('code')!, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: ICI, grant_type: 'authorization_code',
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.refresh_token) return vers('/drive-erreur');
  await majConnexion({ refresh_token: d.refresh_token, etat: null, etat_le: null });
  return vers('');
}

const ACTIONS: Record<string, (req: Request, p: URLSearchParams) => Promise<Response>> = {
  // Adresse d'autorisation Google, à ouvrir depuis l'application.
  async connecter(req, p) {
    await duFoyer(req);
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Erreur('Secrets Google manquants dans Supabase.', 500);
    const retour = p.get('retour') ?? '';
    if (!RETOURS.some(r => r.test(retour))) throw new Erreur('Adresse de retour refusée.');
    const etat = crypto.randomUUID();
    await majConnexion({ etat, etat_le: new Date().toISOString(), retour });
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: ICI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      state: etat,
    });
    return json({ url });
  },

  // Corps de la requête = le fichier ; renvoie son identifiant Drive.
  async envoyer(req, p) {
    await duFoyer(req);
    const type = DOSSIERS[p.get('type') ?? ''] && p.get('type') !== 'sauvegardes' ? p.get('type')! : 'autre';
    const fichier = await req.blob();
    if (!fichier.size) throw new Erreur('Fichier vide.');
    if (fichier.size > TAILLE_MAX) throw new Erreur('Fichier trop lourd (25 Mo au plus).');
    const c = (await connexion())!;
    const acces = await jetonGoogle(c);
    const id = await deposer(acces, p.get('nom') || 'document', p.get('mime') || 'application/octet-stream', await dossier(acces, c, type), fichier);
    return json({ drive_id: id });
  },

  // Contenu d'un document de la table « documents » (donc du foyer).
  async ouvrir(req, p) {
    const sb = await duFoyer(req);
    const { data: doc } = await sb.from('documents').select('drive_id, mime').eq('id', p.get('id')).maybeSingle();
    if (!doc) throw new Erreur('Document introuvable.', 404);
    const acces = await jetonGoogle(await connexion());
    const r = await google(acces, `${DRIVE}/${doc.drive_id}?alt=media`);
    return new Response(r.body, {
      headers: { ...CORS, 'Content-Type': doc.mime || r.headers.get('Content-Type') || 'application/octet-stream' },
    });
  },

  // Met le fichier à la corbeille du Drive (récupérable pendant 30 jours).
  async supprimer(req, p) {
    const sb = await duFoyer(req);
    const { data: doc } = await sb.from('documents').select('drive_id').eq('id', p.get('id')).maybeSingle();
    if (!doc) return json({ ok: true });
    const acces = await jetonGoogle(await connexion());
    try {
      await google(acces, `${DRIVE}/${doc.drive_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
      });
    } catch (e) {
      if (!(e instanceof Erreur && e.statut === 404)) throw e;
    }
    return json({ ok: true });
  },

  // Copie de toutes les données dans Drive/Chantier maison/Sauvegardes,
  // au plus une fois par semaine (ou tout de suite avec force=1).
  // Appelée à chaque ouverture de l'application : sert aussi à connaître l'état.
  async sauvegarder(req, p) {
    const sb = await duFoyer(req);
    const c = await connexion();
    if (!c?.refresh_token) return json({ connecte: false });
    const derniere = c.derniere_sauvegarde;
    if (derniere && Date.now() - Date.parse(derniere) < SEMAINE && p.get('force') !== '1') {
      return json({ connecte: true, derniere_sauvegarde: derniere });
    }
    const donnees: Record<string, unknown> = { sauvegarde_le: new Date().toISOString() };
    for (const t of TABLES) {
      const { data, error } = await sb.from(t).select('*');
      if (error) throw new Error(`${t} : ${error.message}`);
      donnees[t] = data;
    }
    const acces = await jetonGoogle(c);
    const nom = `sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    await deposer(acces, nom, 'application/json', await dossier(acces, c, 'sauvegardes'), JSON.stringify(donnees, null, 1));
    const maintenant = new Date().toISOString();
    await majConnexion({ derniere_sauvegarde: maintenant });
    return json({ connecte: true, derniere_sauvegarde: maintenant, fait: true });
  },
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const p = new URL(req.url).searchParams;
  try {
    if (p.has('state')) return await retourGoogle(p);
    const action = ACTIONS[p.get('action') ?? ''];
    if (!action) throw new Erreur('Action inconnue.', 404);
    return await action(req, p);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : String(e) }, e instanceof Erreur ? e.statut : 500);
  }
});
