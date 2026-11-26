-- =====================================================================
-- AGENDA ↔ RAPPORTS : marquer une échéance comme traitée
--
-- À exécuter MANUELLEMENT dans le SQL Editor. Non appliquée par le déploiement.
--
-- Une échéance de type « Rapport » peut être reliée au rapport qu'elle a
-- produit. L'événement cesse alors de proposer « Créer le rapport » et affiche
-- un état « traité ».
-- =====================================================================

alter table public.company_agenda_events
  add column if not exists report_id uuid references public.reports(id) on delete set null;

create index if not exists company_agenda_events_report_idx
  on public.company_agenda_events (report_id);

comment on column public.company_agenda_events.report_id is
  'Rapport produit depuis cette échéance. NULL = reste à faire.';
