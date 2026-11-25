-- =====================================================================
-- MODULE INVENTAIRE PAR DÉPARTEMENT
--
-- À exécuter MANUELLEMENT dans le SQL Editor. Non appliquée par le déploiement.
--
-- Une entreprise peut avoir plusieurs départements ; chaque ligne d'inventaire
-- appartient à un département (ou à aucun, « non affecté »).
--
-- RLS : réutilise app_private.compliance_is_member(entity) créée par la migration
-- du score de conformité. Son nom est hérité, mais la sémantique est générique :
-- « cet utilisateur appartient-il à cette entreprise ? ». Elle est SECURITY
-- DEFINER, donc pas de récursion sur company_members.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Départements
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Un nom de département unique par entreprise, sans tenir compte de la casse.
create unique index if not exists departments_company_name_idx
  on public.departments (company_id, lower(trim(name)));

-- ---------------------------------------------------------------------
-- 2. Lignes d'inventaire
-- ---------------------------------------------------------------------
create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,

  name          text not null check (length(trim(name)) > 0),
  category      text not null default '',
  quantity      integer not null default 1 check (quantity >= 0),
  serial_number text not null default '',
  assigned_to   uuid references auth.users(id) on delete set null,

  -- in_service : en service · repair : en réparation
  -- retired : réformé   · missing : manquant
  status        text not null default 'in_service'
    check (status in ('in_service', 'repair', 'retired', 'missing')),

  notes         text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists inventory_items_company_idx
  on public.inventory_items (company_id, department_id);

create index if not exists inventory_items_status_idx
  on public.inventory_items (company_id, status);

-- updated_at automatique (trigger distinct de celui des actions)
create or replace function app_private.inventory_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function app_private.inventory_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.departments     enable row level security;
alter table public.inventory_items enable row level security;

-- Départements : lecture et gestion par les membres de l'entreprise.
drop policy if exists departments_select_member on public.departments;
create policy departments_select_member on public.departments
  for select to authenticated
  using (app_private.compliance_is_member(company_id));

drop policy if exists departments_insert_member on public.departments;
create policy departments_insert_member on public.departments
  for insert to authenticated
  with check (app_private.compliance_is_member(company_id));

drop policy if exists departments_update_member on public.departments;
create policy departments_update_member on public.departments
  for update to authenticated
  using (app_private.compliance_is_member(company_id))
  with check (app_private.compliance_is_member(company_id));

drop policy if exists departments_delete_member on public.departments;
create policy departments_delete_member on public.departments
  for delete to authenticated
  using (app_private.compliance_is_member(company_id));

-- Inventaire : mêmes règles.
drop policy if exists inventory_items_select_member on public.inventory_items;
create policy inventory_items_select_member on public.inventory_items
  for select to authenticated
  using (app_private.compliance_is_member(company_id));

drop policy if exists inventory_items_insert_member on public.inventory_items;
create policy inventory_items_insert_member on public.inventory_items
  for insert to authenticated
  with check (app_private.compliance_is_member(company_id));

drop policy if exists inventory_items_update_member on public.inventory_items;
create policy inventory_items_update_member on public.inventory_items
  for update to authenticated
  using (app_private.compliance_is_member(company_id))
  with check (app_private.compliance_is_member(company_id));

drop policy if exists inventory_items_delete_member on public.inventory_items;
create policy inventory_items_delete_member on public.inventory_items
  for delete to authenticated
  using (app_private.compliance_is_member(company_id));
