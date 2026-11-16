-- ============================================================================
-- Partage public des plannings (documents de prévision)
-- ============================================================================
-- Même principe que le partage de rapport : un jeton opaque donne accès en
-- lecture seule, sans compte, pendant une durée limitée.
-- ============================================================================

create table if not exists public.plan_shares (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plan_documents(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists plan_shares_plan_idx on public.plan_shares (plan_id);
create index if not exists plan_shares_token_idx on public.plan_shares (token);

alter table public.plan_shares enable row level security;
grant select, insert, delete on public.plan_shares to authenticated;
grant all on public.plan_shares to service_role;

drop policy if exists "plan_shares select" on public.plan_shares;
create policy "plan_shares select" on public.plan_shares for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.plan_documents d
    where d.id = plan_shares.plan_id
      and app_private.is_company_owner(auth.uid(), d.company_id)
  )
);

drop policy if exists "plan_shares insert" on public.plan_shares;
create policy "plan_shares insert" on public.plan_shares for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "plan_shares delete" on public.plan_shares;
create policy "plan_shares delete" on public.plan_shares for delete to authenticated
using (created_by = auth.uid());
