// Accès aux données : Supabase si config.js est renseigné, sinon mode démo
// (données gardées dans le navigateur, pour essayer l'application).

const TRI = {
  postes: ['ordre', true],
  devis: ['created_at', true],
  devis_historique: ['modifie_le', false],
  factures: ['date_facture', false],
  taches: ['ordre', true],
  relances: ['date_relance', false],
  reglages: ['id', true],
  documents: ['created_at', false],
  prets: ['created_at', true],
};

window.creerBase = function (cfg) {
  return cfg.supabaseUrl ? baseSupabase(cfg) : baseDemo();
};

function baseSupabase(cfg) {
  const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const ok = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    demo: false,
    async session() { return ok(await sb.auth.getSession()).session; },
    async connexion(email, motDePasse) { ok(await sb.auth.signInWithPassword({ email, password: motDePasse })); },
    async deconnexion() { await sb.auth.signOut(); },
    async lister(table) {
      const [col, asc] = TRI[table];
      return ok(await sb.from(table).select('*').order(col, { ascending: asc, nullsFirst: false }));
    },
    async ajouter(table, lignes) { return ok(await sb.from(table).insert(lignes).select()); },
    async modifier(table, id, champs) { ok(await sb.from(table).update(champs).eq('id', id)); },
    async supprimer(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    // Pont vers le Google Drive (supabase/functions/drive). Sans corps : GET.
    async drive(action, params = {}, corps) {
      const { session } = ok(await sb.auth.getSession());
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/drive?${new URLSearchParams({ action, ...params })}`, {
        method: corps === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey },
        body: corps,
      });
      const json = (r.headers.get('Content-Type') || '').includes('json');
      if (!r.ok) throw new Error((json ? (await r.json()).erreur : await r.text()) || `Drive : erreur ${r.status}`);
      return json ? r.json() : r.blob();
    },
  };
}

function baseDemo() {
  const CLE = 'chantier-demo';
  let d = null;
  try { d = JSON.parse(localStorage.getItem(CLE)); } catch (e) { /* stockage indisponible */ }
  d = d || {};
  for (const t of Object.keys(TRI)) d[t] = d[t] || [];
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(d)); } catch (e) { /* idem */ } };
  const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const val = v => (v == null || v === '' ? null : Number(v));

  function trier(table, lignes) {
    const [col, asc] = TRI[table];
    return lignes.slice().sort((a, b) => {
      const x = a[col], y = b[col];
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
    });
  }

  // Mêmes effets que les liens et le déclencheur de schema.sql.
  return {
    demo: true,
    async session() { return { user: { email: 'mode démo' } }; },
    async connexion() {},
    async deconnexion() {},
    async lister(table) { return trier(table, d[table]); },
    async ajouter(table, lignes) {
      const maintenant = new Date().toISOString();
      const ajout = [].concat(lignes).map(l => {
        const r = { id: nouvelId(), created_at: maintenant, ...l };
        if (table === 'devis') r.montant_initial = r.montant_initial ?? r.montant_estimatif ?? r.montant_valide ?? null;
        if (table === 'devis_historique') r.modifie_le = maintenant;        d[table].push(r);
        return r;
      });
      sauver();
      return ajout;
    },
    async modifier(table, id, champs) {
      const r = d[table].find(x => x.id === id);
      if (table === 'devis') {
        for (const champ of ['montant_estimatif', 'montant_valide']) {
          if (champ in champs && val(champs[champ]) !== val(r[champ])) {
            d.devis_historique.push({
              id: nouvelId(), devis_id: id, champ, ancien: val(r[champ]), nouveau: val(champs[champ]),
              modifie_le: new Date().toISOString(), auteur: champs.auteur ?? null,
            });
          }
        }
        r.montant_initial = r.montant_initial ?? champs.montant_estimatif ?? champs.montant_valide ?? null;
      }
      Object.assign(r, champs);
      sauver();
    },
    async supprimer(table, id) {
      d[table] = d[table].filter(x => x.id !== id);
      if (table === 'devis') {
        d.devis_historique = d.devis_historique.filter(x => x.devis_id !== id);
        for (const t of ['factures', 'documents']) d[t].forEach(x => { if (x.devis_id === id) x.devis_id = null; });
      }
      if (table === 'factures') d.documents.forEach(x => { if (x.facture_id === id) x.facture_id = null; });
      if (table === 'documents') d.prets.forEach(x => { if (x.document_id === id) x.document_id = null; });
      if (table === 'taches') d.taches.forEach(x => { if (x.apres_id === id) x.apres_id = null; });
      if (table === 'postes') {
        d.relances = d.relances.filter(x => x.poste_id !== id);
        for (const t of ['devis', 'factures', 'taches', 'documents']) d[t].forEach(x => { if (x.poste_id === id) x.poste_id = null; });
      }
      sauver();
    },
    async drive() { throw new Error('Mode démo : les documents passent par le Drive, disponible une fois l\'application reliée à Supabase.'); },
  };
}
