-- ============================================================================
-- Journal d'erreurs applicatives
-- ============================================================================
-- Remplace une solution externe (Sentry) tant qu'aucun compte n'est branché :
-- les erreurs du navigateur sont enregistrées en base, consultables par les
-- administrateurs de la plateforme.
-- ============================================================================

create table if not exists public.error_events (
  id          uuid primary key default gen_random_uuid(),
  level       text not null default 'error',
  message     text not null,
  stack       text,
  path        text,
  user_id     uuid,
  company_id  uuid,
  user_agent  text,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists error_events_created_idx
  on public.error_events (created_at desc);

alter table public.error_events enable row level security;
grant insert on public.error_events to authenticated;
grant select, insert, delete on public.error_events to service_role;

-- Chaque utilisateur connecté peut signaler une erreur en son nom.
drop policy if exists "error_events insert" on public.error_events;
create policy "error_events insert" on public.error_events for insert to authenticated
with check (user_id = auth.uid());

-- Seuls les administrateurs de la plateforme peuvent les consulter.
drop policy if exists "error_events select" on public.error_events;
create policy "error_events select" on public.error_events for select to authenticated
using (app_private.is_platform_admin(auth.uid()));
