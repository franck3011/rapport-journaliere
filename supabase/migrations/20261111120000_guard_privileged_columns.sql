-- ============================================================================
-- Lot 1 — Sécurité : verrouillage des colonnes privilégiées
-- ============================================================================
-- Problème : les policies RLS autorisent l'auteur à modifier SA ligne, et
-- PostgREST accorde UPDATE sur toutes les colonnes. Un utilisateur pouvait donc
-- passer son rapport en « approved », s'auto-approuver un congé, insérer une
-- note de frais déjà approuvée ou retirer son propre bannissement — sans passer
-- par les server functions.
--
-- Solution : un trigger BEFORE INSERT/UPDATE qui refuse toute modification de
-- ces colonnes sauf si la requête arrive en `service_role` (c'est-à-dire via
-- nos server functions, qui font déjà les contrôles d'autorisation).
-- Les rôles `authenticated` / `anon` (PostgREST avec le JWT utilisateur) sont
-- bloqués avec un code 42501 → PostgREST renvoie 403.
--
-- ⚠️ Ne révoque aucune colonne : les GRANT table-level resteraient prioritaires
-- (en Postgres, REVOKE sur une colonne ne retire rien d'un GRANT table-level).
-- ============================================================================

create or replace function public.guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role text := nullif(current_setting('request.jwt.claim.role', true), '');
  _uid  uuid := auth.uid();
begin
  -- Requête sans utilisateur (service_role, migrations, SQL editor) : autorisée.
  -- Toute requête portant un JWT utilisateur est contrôlée, même si le claim
  -- "role" est absent : c'est auth.uid() qui fait foi.
  if _uid is null and coalesce(_role, '') <> 'authenticated' then
    return new;
  end if;

  -- ------------------------------------------------------------------ reports
  if tg_table_name = 'reports' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'draft') <> 'draft' then
        raise exception 'Un rapport doit être créé en brouillon.'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if new.status                is distinct from old.status
       or new.current_approver_id is distinct from old.current_approver_id
       or new.submitted_at        is distinct from old.submitted_at
       or new.approved_at         is distinct from old.approved_at
       or new.signed_at           is distinct from old.signed_at
       or new.signature_image     is distinct from old.signature_image
       or new.stamp_image         is distinct from old.stamp_image
       or new.signer_name         is distinct from old.signer_name
       or new.signer_role         is distinct from old.signer_role
       or new.company_id          is distinct from old.company_id
       or new.author_id           is distinct from old.author_id then
      raise exception 'Modification interdite : utilisez le circuit de validation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- ----------------------------------------------------------------- profiles
  if tg_table_name = 'profiles' then
    if tg_op = 'UPDATE'
       and (new.is_banned    is distinct from old.is_banned
         or new.banned_at    is distinct from old.banned_at
         or new.banned_reason is distinct from old.banned_reason
         or new.admin_only   is distinct from old.admin_only) then
      raise exception 'Modification interdite : champ réservé à l''administration.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- ----------------------------------------------------------- leave_requests
  if tg_table_name = 'leave_requests' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'draft') not in ('draft', 'submitted') then
        raise exception 'Une demande de congé doit être créée en brouillon ou soumise.'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if new.decided_at is distinct from old.decided_at then
      raise exception 'Modification interdite : seule la hiérarchie peut décider.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      -- L'auteur peut soumettre son brouillon et annuler sa demande.
      if old.user_id = _uid
         and new.status = 'submitted' and old.status = 'draft' then
        return new;
      end if;
      if old.user_id = _uid
         and new.status = 'cancelled' and old.status in ('draft', 'submitted', 'approved') then
        return new;
      end if;
      raise exception 'Modification interdite : seule la hiérarchie peut décider.'
        using errcode = '42501';
    end if;

    -- Hors transition de statut, le circuit de validation n'est pas modifiable.
    if new.current_approver_id is distinct from old.current_approver_id then
      raise exception 'Modification interdite : seule la hiérarchie peut décider.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- --------------------------------------------------------- expense_reports
  if tg_table_name = 'expense_reports' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'draft') not in ('draft', 'submitted') then
        raise exception 'Une note de frais doit être créée en brouillon ou soumise.'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if new.decided_at       is distinct from old.decided_at
       or new.decided_by       is distinct from old.decided_by
       or new.decision_comment is distinct from old.decision_comment then
      raise exception 'Modification interdite : seul le valideur peut décider.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      if old.author_id = _uid
         and new.status = 'submitted' and old.status = 'draft' then
        return new;
      end if;
      raise exception 'Modification interdite : seul le valideur peut décider.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_privileged_reports on public.reports;
create trigger guard_privileged_reports
  before insert or update on public.reports
  for each row execute function public.guard_privileged_columns();

drop trigger if exists guard_privileged_profiles on public.profiles;
create trigger guard_privileged_profiles
  before insert or update on public.profiles
  for each row execute function public.guard_privileged_columns();

drop trigger if exists guard_privileged_leave_requests on public.leave_requests;
create trigger guard_privileged_leave_requests
  before insert or update on public.leave_requests
  for each row execute function public.guard_privileged_columns();

drop trigger if exists guard_privileged_expense_reports on public.expense_reports;
create trigger guard_privileged_expense_reports
  before insert or update on public.expense_reports
  for each row execute function public.guard_privileged_columns();

-- ============================================================================
-- Quota d'usage IA (par utilisateur, fenêtre glissante de 24 h)
-- ============================================================================
-- Le code appelle ce quota de façon « fail-open » : si la table n'existe pas
-- encore, les fonctions IA continuent de répondre normalement.
create table if not exists public.ai_usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;
grant select, insert on public.ai_usage_events to authenticated;
grant all on public.ai_usage_events to service_role;

drop policy if exists "ai usage select own" on public.ai_usage_events;
create policy "ai usage select own" on public.ai_usage_events
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "ai usage insert own" on public.ai_usage_events;
create policy "ai usage insert own" on public.ai_usage_events
  for insert to authenticated with check (auth.uid() = user_id);
