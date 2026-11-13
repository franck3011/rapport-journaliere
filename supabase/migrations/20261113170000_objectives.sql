-- ============================================================================
-- Module « Objectifs » — réalisé vs cible, par personne ou pour l'entreprise
-- ============================================================================
-- Deux natures d'objectif :
--   * `reports`  : cible = nombre de rapports sur la période, le réalisé est
--                  calculé automatiquement depuis la table reports ;
--   * `manual`   : cible et réalisé saisis à la main (CA, production, incidents…).
-- ============================================================================

create table if not exists public.objectives (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  -- null = objectif d'entreprise
  owner_id       uuid references auth.users(id) on delete cascade,
  title          text not null check (length(trim(title)) > 0),
  kind           text not null default 'manual' check (kind in ('reports','manual')),
  target_value   numeric not null default 0 check (target_value >= 0),
  current_value  numeric not null default 0 check (current_value >= 0),
  unit           text not null default '',
  period_start   date not null,
  period_end     date not null,
  created_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint objectives_period_check check (period_end >= period_start)
);

create index if not exists objectives_company_period_idx
  on public.objectives (company_id, period_start, period_end);
create index if not exists objectives_owner_idx
  on public.objectives (owner_id);

drop trigger if exists objectives_set_updated_at on public.objectives;
create trigger objectives_set_updated_at
  before update on public.objectives
  for each row execute function public.set_updated_at();

alter table public.objectives enable row level security;
grant select, insert, update, delete on public.objectives to authenticated;
grant all on public.objectives to service_role;

-- Lecture : tout membre de l'entreprise (les objectifs fédèrent l'équipe)
drop policy if exists "objectives select" on public.objectives;
create policy "objectives select" on public.objectives for select to authenticated
using (app_private.is_company_member(auth.uid(), company_id));

-- Création : soi-même, son équipe ou toute l'entreprise selon le périmètre
drop policy if exists "objectives insert" on public.objectives;
create policy "objectives insert" on public.objectives for insert to authenticated
with check (
  app_private.is_company_member(auth.uid(), company_id)
  and created_by = auth.uid()
  and (
    owner_id = auth.uid()
    or owner_id is null and app_private.is_company_owner(auth.uid(), company_id)
    or app_private.is_manager_of(auth.uid(), owner_id)
    or app_private.is_dg_of_user(auth.uid(), owner_id)
  )
);

-- Mise à jour : le responsable (réalisé manuel), son manager, le DG
drop policy if exists "objectives update" on public.objectives;
create policy "objectives update" on public.objectives for update to authenticated
using (
  owner_id = auth.uid()
  or app_private.is_manager_of(auth.uid(), owner_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
  or (owner_id is null and app_private.is_company_owner(auth.uid(), company_id))
)
with check (
  owner_id = auth.uid()
  or app_private.is_manager_of(auth.uid(), owner_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
  or (owner_id is null and app_private.is_company_owner(auth.uid(), company_id))
);

drop policy if exists "objectives delete" on public.objectives;
create policy "objectives delete" on public.objectives for delete to authenticated
using (
  created_by = auth.uid()
  or app_private.is_dg_of_user(auth.uid(), owner_id)
  or (owner_id is null and app_private.is_company_owner(auth.uid(), company_id))
);
