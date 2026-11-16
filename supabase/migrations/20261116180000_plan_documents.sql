-- ============================================================================
-- Module « Planning » — DOCUMENT de prévision (et non agenda de tâches)
-- ============================================================================
-- Même logique qu'un rapport : titre, introduction, sections, conclusion.
-- La différence est le temps : ici on décrit ce qui VA se passer sur la période.
-- Les sections sont stockées en JSON pour rester souples (pas de tables filles).
-- ============================================================================

create table if not exists public.plan_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  intro        text not null default '',
  conclusion   text not null default '',
  sections     jsonb not null default '[]'::jsonb,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft' check (status in ('draft', 'final')),
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint plan_documents_period_check check (period_end >= period_start)
);

create index if not exists plan_documents_company_period_idx
  on public.plan_documents (company_id, period_start desc);

drop trigger if exists plan_documents_set_updated_at on public.plan_documents;
create trigger plan_documents_set_updated_at
  before update on public.plan_documents
  for each row execute function public.set_updated_at();

alter table public.plan_documents enable row level security;
grant select, insert, update, delete on public.plan_documents to authenticated;
grant all on public.plan_documents to service_role;

drop policy if exists "plan_documents select" on public.plan_documents;
create policy "plan_documents select" on public.plan_documents for select to authenticated
using (app_private.is_company_member(auth.uid(), company_id));

drop policy if exists "plan_documents insert" on public.plan_documents;
create policy "plan_documents insert" on public.plan_documents for insert to authenticated
with check (
  app_private.is_company_member(auth.uid(), company_id)
  and created_by = auth.uid()
);

drop policy if exists "plan_documents update" on public.plan_documents;
create policy "plan_documents update" on public.plan_documents for update to authenticated
using (
  created_by = auth.uid()
  or app_private.is_company_owner(auth.uid(), company_id)
)
with check (
  created_by = auth.uid()
  or app_private.is_company_owner(auth.uid(), company_id)
);

drop policy if exists "plan_documents delete" on public.plan_documents;
create policy "plan_documents delete" on public.plan_documents for delete to authenticated
using (
  created_by = auth.uid()
  or app_private.is_company_owner(auth.uid(), company_id)
);
