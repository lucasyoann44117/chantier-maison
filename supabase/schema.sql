-- Suivi de chantier : schéma de la base.
-- À exécuter une seule fois dans Supabase > SQL Editor, sur un projet vide.
-- Les données du chantier (postes, devis, tâches) se chargent ensuite depuis
-- l'application, bouton « Charger les données du chantier ».

create extension if not exists pgcrypto;

-- Comptes autorisés : les deux personnes du foyer.
-- Remplacer les adresses puis exécuter cette ligne (voir README).
create table foyer (email text primary key);
-- insert into foyer (email) values ('personne1@exemple.fr'), ('personne2@exemple.fr');

create or replace function est_du_foyer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from foyer where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

create table postes (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  ordre int not null default 0,
  nom text not null,
  entreprise text,
  contact text,
  telephone text,
  email text,
  statut text not null default 'a_contacter'
    check (statut in ('a_contacter', 'relance', 'planifie', 'en_cours', 'termine')),
  debut_prevu date,
  fin_prevue date,
  debut_reel date,
  fin_reelle date,
  notes text,
  created_at timestamptz not null default now()
);

create table devis (
  id uuid primary key default gen_random_uuid(),
  poste_id uuid references postes (id) on delete set null,
  numero text,
  entreprise text,
  date_devis date,
  date_validite date,
  montant_ht numeric(12, 2),
  statut text not null default 'estimatif'
    check (statut in ('estimatif', 'valide', 'refuse')),
  -- Premier montant connu, figé : sert à mesurer la dérive.
  montant_initial numeric(12, 2),
  montant_estimatif numeric(12, 2),
  montant_valide numeric(12, 2),
  date_validation date,
  acompte_pct numeric(5, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chaque changement de montant d'un devis, avec l'ancien et le nouveau.
create table devis_historique (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references devis (id) on delete cascade,
  champ text not null,
  ancien numeric(12, 2),
  nouveau numeric(12, 2),
  modifie_le timestamptz not null default now(),
  modifie_par uuid default auth.uid(),
  auteur text
);

create or replace function devis_suivi() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.montant_initial := coalesce(new.montant_initial, new.montant_estimatif, new.montant_valide);
    return new;
  end if;
  if new.montant_estimatif is distinct from old.montant_estimatif then
    insert into devis_historique (devis_id, champ, ancien, nouveau, auteur)
    values (old.id, 'montant_estimatif', old.montant_estimatif, new.montant_estimatif, new.auteur);
  end if;
  if new.montant_valide is distinct from old.montant_valide then
    insert into devis_historique (devis_id, champ, ancien, nouveau, auteur)
    values (old.id, 'montant_valide', old.montant_valide, new.montant_valide, new.auteur);
  end if;
  -- Le montant initial reste celui du premier enregistrement, sauf s'il manquait.
  new.montant_initial := coalesce(old.montant_initial, new.montant_estimatif, new.montant_valide);
  new.updated_at := now();
  return new;
end;
$$;

create trigger devis_suivi before insert or update on devis
for each row execute function devis_suivi();

create table factures (
  id uuid primary key default gen_random_uuid(),
  numero text,
  date_facture date,
  entreprise text,
  poste_id uuid references postes (id) on delete set null,
  devis_id uuid references devis (id) on delete set null,
  montant_ht numeric(12, 2),
  tva numeric(12, 2),
  montant_ttc numeric(12, 2),
  statut text not null default 'a_payer' check (statut in ('a_payer', 'paye')),
  source text check (source in ('banque', 'apport')),
  date_reglement date,
  montant_regle numeric(12, 2),
  notes text,
  created_at timestamptz not null default now()
);

-- Tâches du planning : interventions ou tâches personnelles (responsable « Nous »).
create table taches (
  id uuid primary key default gen_random_uuid(),
  ordre int not null default 0,
  titre text not null,
  responsable text,
  poste_id uuid references postes (id) on delete set null,
  -- Prévu (debut, fin) et réalisé (debut_reel, fin_reelle).
  debut date,
  fin date,
  debut_reel date,
  fin_reelle date,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'fait')),
  -- Tâche qui doit être finie avant celle-ci (ordre d'intervention).
  apres_id uuid references taches (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table relances (
  id uuid primary key default gen_random_uuid(),
  poste_id uuid not null references postes (id) on delete cascade,
  date_relance date not null default current_date,
  moyen text,
  reponse text,
  created_at timestamptz not null default now()
);

-- Réglages du foyer, une ligne par réglage (par exemple id = 'budget').
create table reglages (
  id text primary key,
  valeur numeric(12, 2),
  updated_at timestamptz not null default now()
);

-- Accès : uniquement les comptes connectés inscrits dans « foyer ».
-- La table foyer n'a aucune règle : elle reste invisible depuis l'application.
alter table foyer enable row level security;

do $$
declare t text;
begin
  foreach t in array array['postes', 'devis', 'devis_historique', 'factures', 'taches', 'relances', 'reglages'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy foyer_tout on %I for all to authenticated using (est_du_foyer()) with check (est_du_foyer())', t);
  end loop;
end $$;

-- Droits explicites, au cas où le projet n'expose pas les nouvelles tables.
grant select, insert, update, delete
  on postes, devis, devis_historique, factures, taches, relances, reglages to authenticated;

-- Compte partagé : chaque ligne garde le prénom de qui l'a modifiée en dernier,
-- déduit de l'appareil par l'application.
do $$
declare t text;
begin
  foreach t in array array['postes', 'devis', 'factures', 'taches', 'relances', 'reglages'] loop
    execute format('alter table %I add column auteur text', t);
  end loop;
end $$;

revoke execute on function est_du_foyer() from public, anon;
grant execute on function est_du_foyer() to authenticated;
