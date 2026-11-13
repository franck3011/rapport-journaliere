-- ============================================================================
-- Module « Actions » — relevé de décisions issu des rapports
-- ============================================================================
-- Une action = « qui fait quoi, pour quand », décidée dans un rapport (ou
-- ajoutée à la main). Elle devient suivie jusqu'à sa clôture.
-- ============================================================================

create table if not exists public.report_actions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  report_id     uuid references public.reports(id) on delete set null,
  title         text not null check (length(trim(title)) > 0),
  details       text not null default '',
  owner_id      uuid not null references auth.users(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'todo'
                check (status in ('todo','doing','done','cancelled')),
  priority      text not null default 'normal'
                check (priority in ('normal','high','urgent')),
  due_date      date,
  completed_at  timestamptz,
  source        text not null default 'manual' check (source in ('manual','ai')),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index pour les écrans fréquents (mes actions, actions d'équipe, retards)
create index if not exists report_actions_owner_status_idx
  on public.report_actions (owner_id, status);
create index if not exists report_actions_company_status_idx
  on public.report_actions (company_id, status);
create index if not exists report_actions_due_idx
  on public.report_actions (due_date) where status in ('todo','doing');
create index if not exists report_actions_report_idx
  on public.report_actions (report_id);

-- updated_at automatique (fonction déjà présente dans la base)
drop trigger if exists report_actions_set_updated_at on public.report_actions;
create trigger report_actions_set_updated_at
  before update on public.report_actions
  for each row execute function public.set_updated_at();

-- completed_at automatique quand on passe à « done »
create or replace function public.report_actions_touch_completed()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists report_actions_completed on public.report_actions;
create trigger report_actions_completed
  before update on public.report_actions
  for each row execute function public.report_actions_touch_completed();

-- ---------------------------------------------------------------------------
-- RLS : chacun voit ses actions, les managers celles de leur équipe,
-- le DG celles de toute l'entreprise.
-- ---------------------------------------------------------------------------
alter table public.report_actions enable row level security;
grant select, insert, update, delete on public.report_actions to authenticated;
grant all on public.report_actions to service_role;

drop policy if exists "actions select" on public.report_actions;
create policy "actions select" on public.report_actions for select to authenticated
using (
  app_private.is_company_member(auth.uid(), company_id)
  and (
    owner_id = auth.uid()
    or created_by = auth.uid()
    or app_private.is_manager_of(auth.uid(), owner_id)
    or app_private.is_dg_of_user(auth.uid(), owner_id)
    or app_private.is_platform_admin(auth.uid())
  )
);

drop policy if exists "actions insert" on public.report_actions;
create policy "actions insert" on public.report_actions for insert to authenticated
with check (
  app_private.is_company_member(auth.uid(), company_id)
  and created_by = auth.uid()
  and (
    owner_id = auth.uid()
    or app_private.is_manager_of(auth.uid(), owner_id)
    or app_private.is_dg_of_user(auth.uid(), owner_id)
  )
);

drop policy if exists "actions update" on public.report_actions;
create policy "actions update" on public.report_actions for update to authenticated
using (
  owner_id = auth.uid()
  or created_by = auth.uid()
  or app_private.is_manager_of(auth.uid(), owner_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
)
with check (
  owner_id = auth.uid()
  or created_by = auth.uid()
  or app_private.is_manager_of(auth.uid(), owner_id)
  or app_private.is_dg_of_user(auth.uid(), owner_id)
);

drop policy if exists "actions delete" on public.report_actions;
create policy "actions delete" on public.report_actions for delete to authenticated
using (
  created_by = auth.uid()
  or app_private.is_dg_of_user(auth.uid(), owner_id)
  or app_private.is_platform_admin(auth.uid())
);
