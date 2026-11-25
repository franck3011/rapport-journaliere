-- =====================================================================
-- AGENDA D'ENTREPRISE
--
-- À exécuter MANUELLEMENT. Non appliquée par le déploiement.
--
-- Deux usages :
--   1. événements créés à la main (rapport à produire, e-mail à envoyer,
--      réunion, relance), avec récurrence simple ;
--   2. agrégation des échéances déjà présentes en base : actions, jalons,
--      e-mails programmés, absences — lue par l'application, sans copie.
--
-- RLS : app_private.compliance_is_member(entity) — SECURITY DEFINER, donc pas
-- de récursion sur company_members.
-- =====================================================================

create table if not exists public.company_agenda_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,

  title       text not null check (length(trim(title)) > 0),
  kind        text not null default 'autre'
    check (kind in ('rapport', 'mail', 'reunion', 'relance', 'autre')),

  event_date  date not null,
  event_time  time,

  -- none : une seule fois · daily / weekly / monthly : répétition
  recurrence  text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly')),

  notes       text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists company_agenda_events_date_idx
  on public.company_agenda_events (company_id, event_date);

alter table public.company_agenda_events enable row level security;

drop policy if exists company_agenda_events_member on public.company_agenda_events;
create policy company_agenda_events_member on public.company_agenda_events
  for all to authenticated
  using (app_private.compliance_is_member(company_id))
  with check (app_private.compliance_is_member(company_id));
