-- =====================================================================
-- Module « Score de conformité »  —  version 5
--
-- À exécuter MANUELLEMENT, d'abord sur un projet de recette.
-- Tout est enveloppé dans une transaction : si une instruction échoue,
-- rien n'est appliqué à moitié.
--
-- Corrections de la v5 :
--   1. Trigger : coalesce APRÈS le SELECT INTO (un SELECT INTO sans ligne met
--      NULL et écrasait les valeurs par défaut → completed_at jamais rempli).
--   2. Réglages créés automatiquement pour toute nouvelle entreprise.
--   3. Politique d'INSERT supprimée sur compliance_scores : seul le serveur
--      (clé de service) écrit un score. Un admin ne peut plus fabriquer un 100.
--   4. Contrainte sur done_statuses / open_statuses : uniquement des valeurs
--      que report_actions accepte réellement.
--   5. details doit contenir un instantané des réglages utilisés (documenté
--      ici, produit par le calcul).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Prérequis (déjà appliqués à la main) — reproductibilité
-- ---------------------------------------------------------------------
alter table public.report_actions add column if not exists completed_at timestamptz;

create index if not exists report_actions_completed_idx
  on public.report_actions (company_id, completed_at);

-- ---------------------------------------------------------------------
-- 1. Fonctions d'appartenance — app_private, sans paramètre utilisateur
-- ---------------------------------------------------------------------
create schema if not exists app_private;
grant usage on schema app_private to authenticated;

create or replace function app_private.compliance_is_member(p_entity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_entity
      and m.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.companies c
    where c.id = p_entity
      and c.owner_id = (select auth.uid())
  );
$$;

create or replace function app_private.compliance_is_manager(p_entity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.companies c
    where c.id = p_entity
      and c.owner_id = (select auth.uid())
  )
  or exists (
    select 1 from public.company_members m
    where m.company_id = p_entity
      and m.user_id = (select auth.uid())
      -- Rôles vérifiés en base le 24/11/2026 : 'owner' et 'employee' seulement.
      -- 'admin' est conservé pour un futur rôle d'encadrement (sans effet aujourd'hui).
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function app_private.compliance_is_member(uuid) from public;
revoke all on function app_private.compliance_is_member(uuid) from anon;
revoke all on function app_private.compliance_is_manager(uuid) from public;
revoke all on function app_private.compliance_is_manager(uuid) from anon;
grant execute on function app_private.compliance_is_member(uuid) to authenticated;
grant execute on function app_private.compliance_is_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Réglages
-- ---------------------------------------------------------------------
create table if not exists public.compliance_settings (
  entity_id          uuid primary key references public.companies(id) on delete cascade,

  weight_punctuality  integer not null default 40 check (weight_punctuality between 0 and 100),
  weight_completeness integer not null default 30 check (weight_completeness between 0 and 100),
  weight_incidents    integer not null default 20 check (weight_incidents between 0 and 100),
  weight_regularity   integer not null default 10 check (weight_regularity between 0 and 100),

  report_due_hour     integer not null default 18 check (report_due_hour between 0 and 23),
  incident_sla_days   integer not null default 3  check (incident_sla_days between 1 and 90),
  grace_days          integer not null default 1  check (grace_days between 0 and 15),

  -- Statuts considérés comme « terminé ». Contrainte : uniquement des valeurs
  -- que report_actions accepte réellement (union des deux CHECK connus).
  done_statuses       text[] not null default array['done'],

  -- Statuts qui rouvrent l'action (la date de clôture est effacée).
  open_statuses       text[] not null default array['todo','doing','cancelled'],

  min_sample          integer not null default 10 check (min_sample between 5 and 1000),

  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),

  constraint compliance_settings_weights_sum
    check (weight_punctuality + weight_completeness + weight_incidents + weight_regularity = 100),

  -- Seul 'done' peut clôturer ; les statuts ouverts ne peuvent pas y figurer,
  -- et l'intersection des deux listes doit être vide. Empeche un admin de
  -- declarer 'todo' comme termine, ou de vider la liste.
  constraint compliance_settings_statuses_valid check (
    cardinality(done_statuses) >= 1
    and done_statuses <@ array['done']
    and open_statuses <@ array['todo','doing','cancelled']
    and not (done_statuses && open_statuses)
  )
);

comment on column public.compliance_settings.done_statuses is
  'Statuts de clôture. Restreints aux valeurs admises par report_actions.status.';

-- ---------------------------------------------------------------------
-- 3. Trigger : completed_at suit le statut (corrigé)
-- ---------------------------------------------------------------------
create or replace function app_private.report_actions_sync_completed_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_done text[];
  v_open text[];
begin
  -- Aucune ligne de réglages → v_done / v_open restent NULL ici,
  -- le coalesce s'applique APRÈS (un SELECT INTO vide met NULL, il n'évalue
  -- pas un coalesce situé dans la requête).
  select s.done_statuses, s.open_statuses
    into v_done, v_open
  from public.compliance_settings s
  where s.entity_id = new.company_id;

  v_done := coalesce(v_done, array['done']);
  v_open := coalesce(v_open, array['todo','doing','cancelled']);

  if new.status = any (v_done) then
    if new.completed_at is null then
      new.completed_at := now();
    end if;
  elsif new.status = any (v_open) then
    new.completed_at := null;
  end if;
  -- Statut inconnu : on ne touche à rien (aucune perte de date).

  return new;
end;
$$;

-- Un trigger créé à la main lors des essais (report_actions_completed) existe
-- déjà sur la table. S'il n'est pas supprimé, les deux triggers s'exécutent :
-- le nôtre remplirait completed_at, puis l'ancien pourrait le remettre à NULL.
-- Vérifié en base le 24/11/2026 : report_actions_completed + report_actions_set_updated_at.
-- report_actions_set_updated_at est conservé (il met à jour updated_at).
drop trigger if exists report_actions_completed on public.report_actions;
drop trigger if exists report_actions_sync_completed on public.report_actions;
create trigger report_actions_sync_completed
  before insert or update of status, completed_at on public.report_actions
  for each row execute function app_private.report_actions_sync_completed_at();

-- ---------------------------------------------------------------------
-- 4. Réglages automatiques pour les nouvelles entreprises
-- ---------------------------------------------------------------------
create or replace function app_private.companies_create_compliance_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.compliance_settings (entity_id)
  values (new.id)
  on conflict (entity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_create_compliance_settings on public.companies;
create trigger companies_create_compliance_settings
  after insert on public.companies
  for each row execute function app_private.companies_create_compliance_settings();

-- ---------------------------------------------------------------------
-- 5. Scores — append-only
-- ---------------------------------------------------------------------
create table if not exists public.compliance_scores (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references public.companies(id) on delete cascade,

  period_start  date not null,
  period_end    date not null,

  score         numeric(5,2) not null check (score between 0 and 100),

  -- Doit contenir :
  --   settings: { poids, delais, min_sample }  ← instantané des réglages
  --   punctuality / completeness / incidents / regularity: { value, weight, points }
  --   measurable_actions: n, excluded_actions: n, excluded_cancelled: n
  details       jsonb not null default '{}'::jsonb,

  calculated_at timestamptz not null default now(),
  calculated_by uuid references auth.users(id) on delete set null,

  constraint compliance_scores_period_order check (period_end >= period_start)
);

create index if not exists compliance_scores_latest_lookup_idx
  on public.compliance_scores (entity_id, period_start, period_end, calculated_at desc);

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.compliance_scores  enable row level security;
alter table public.compliance_settings enable row level security;

drop policy if exists compliance_scores_select_member on public.compliance_scores;
create policy compliance_scores_select_member on public.compliance_scores
  for select to authenticated
  using (app_private.compliance_is_member(entity_id));

-- AUCUNE politique d'INSERT/UPDATE/DELETE : seul le serveur (service role,
-- qui contourne la RLS) écrit un score. Empêche un admin de fabriquer un 100
-- via l'API, ce qui rendrait l'attestation PDF et le QR de vérification faux.
drop policy if exists compliance_scores_insert_manager on public.compliance_scores;

drop policy if exists compliance_settings_select_member on public.compliance_settings;
create policy compliance_settings_select_member on public.compliance_settings
  for select to authenticated
  using (app_private.compliance_is_member(entity_id));

drop policy if exists compliance_settings_write_manager on public.compliance_settings;
create policy compliance_settings_write_manager on public.compliance_settings
  for all to authenticated
  using (app_private.compliance_is_manager(entity_id))
  with check (app_private.compliance_is_manager(entity_id));

-- ---------------------------------------------------------------------
-- 7. Réglages par défaut pour les entreprises existantes
-- ---------------------------------------------------------------------
insert into public.compliance_settings (entity_id)
select c.id from public.companies c
where not exists (select 1 from public.compliance_settings s where s.entity_id = c.id);

-- ---------------------------------------------------------------------
-- 8. Backfill OPTIONNEL — COMMENTÉ (option B : on n'invente pas de date)
-- ---------------------------------------------------------------------
-- update public.report_actions
-- set completed_at = coalesce(updated_at, created_at, now())
-- where status = 'done' and completed_at is null;

-- ---------------------------------------------------------------------
-- 9. Verrouillage des droits de table (defense en profondeur)
--    La RLS n'est pas la seule barriere : Supabase accorde par defaut
--    INSERT/UPDATE/DELETE a authenticated sur les tables de public.
--    Une politique ajoutee par erreur plus tard rouvrirait la faille.
--    service_role n'est pas affecte.
-- ---------------------------------------------------------------------
revoke all on public.compliance_scores from anon;
revoke insert, update, delete, truncate on public.compliance_scores from authenticated;
revoke all on public.compliance_settings from anon;

commit;
