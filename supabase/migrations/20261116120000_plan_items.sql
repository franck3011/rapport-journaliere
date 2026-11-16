-- ============================================================================
-- Module « Planning » — travaux à venir, à la journée, la semaine ou le mois
-- ============================================================================
-- Un élément de planning peut couvrir une seule journée (end_date null) ou
-- plusieurs jours (end_date renseignée). Il est visible sur chaque jour couvert.
-- ============================================================================

create table if not exists public.plan_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  details      text not null default '',
  planned_date date not null,
  end_date     date,
  owner_id     uuid references auth.users(id) on delete set null,
  status       text not null default 'planned'
               check (status in ('planned', 'in_progress', 'done', 'cancelled')),
  priority     text not null default 'normal'
               check (priority in ('normal', 'high', 'urgent')),
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint plan_items_dates_check check (end_date is null or end_date >= planned_date)
);

create index if not exists plan_items_company_date_idx
  on public.plan_items (company_id, planned_date);
create index if not exists plan_items_owner_idx on public.plan_items (owner_id);

drop trigger if exists plan_items_set_updated_at on public.plan_items;
create trigger plan_items_set_updated_at
  before update on public.plan_items
  for each row execute function public.set_updated_at();

alter table public.plan_items enable row level security;
grant select, insert, update, delete on public.plan_items to authenticated;
grant all on public.plan_items to service_role;

-- Lecture : toute l'entreprise (le planning se partage)
drop policy if exists "plan_items select" on public.plan_items;
create policy "plan_items select" on public.plan_items for select to authenticated
using (app_private.is_company_member(auth.uid(), company_id));

-- Création : membre de l'entreprise, en son nom
drop policy if exists "plan_items insert" on public.plan_items;
create policy "plan_items insert" on public.plan_items for insert to authenticated
with check (
  app_private.is_company_member(auth.uid(), company_id)
  and created_by = auth.uid()
);

-- Mise à jour : responsable, son manager, le DG ou le créateur
drop policy if exists "plan_items update" on public.plan_items;
create policy "plan_items update" on public.plan_items for update to authenticated
using (
  created_by = auth.uid()
  or owner_id = auth.uid()
  or app_private.is_manager_of(auth.uid(), owner_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
  or app_private.is_company_owner(auth.uid(), company_id)
)
with check (
  created_by = auth.uid()
  or owner_id = auth.uid()
  or app_private.is_manager_of(auth.uid(), owner_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
  or app_private.is_company_owner(auth.uid(), company_id)
);

drop policy if exists "plan_items delete" on public.plan_items;
create policy "plan_items delete" on public.plan_items for delete to authenticated
using (
  created_by = auth.uid()
  or app_private.is_company_owner(auth.uid(), company_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
);
