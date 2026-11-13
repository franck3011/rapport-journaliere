-- ============================================================================
-- Relances automatiques des actions
-- ============================================================================
-- 1. `last_reminded_at` : évite de notifier deux fois la même action le même jour.
-- 2. Étend la contrainte des notifications : types « action_* », mais aussi
--    « expense_* » et « document_shared » qui existaient dans le code sans être
--    autorisés par la contrainte (les notifications étaient silencieusement perdues).
-- ============================================================================

alter table public.report_actions
  add column if not exists last_reminded_at timestamptz;

create index if not exists report_actions_reminder_idx
  on public.report_actions (status, due_date)
  where status in ('todo', 'doing');

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
check (type in (
  'report_submitted','report_approved','report_rejected','report_reminder',
  'task_assigned','task_completed',
  'leave_submitted','leave_approved','leave_rejected',
  'expense_submitted','expense_approved','expense_rejected',
  'document_shared',
  'action_assigned','action_reminder','action_overdue'
));
