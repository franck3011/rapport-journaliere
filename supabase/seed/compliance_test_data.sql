-- =====================================================================
-- DONNÉES DE TEST — SCORE DE CONFORMITÉ
--
-- ⚠️  À N'EXÉCUTER QUE SUR LE PROJET DE RECETTE (ou une copie de la base).
--     Ce script ÉCRIT dans public.report_actions.
--     Il ne touche ni compliance_settings ni compliance_scores.
--
-- Produit 30 actions variées pour exercer les quatre critères :
--   12 terminées à temps, 6 terminées en retard,
--    6 à faire, 3 en cours, 3 annulées.
--
-- Suppression : la section 3 en fin de fichier.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Génération
-- ---------------------------------------------------------------------
do $$
declare
  v_company uuid;
  v_user uuid;
  v_made integer;
begin
  select c.id, c.owner_id
    into v_company, v_user
  from public.companies c
  where exists (
    select 1 from public.compliance_settings s where s.entity_id = c.id
  )
  order by c.created_at
  limit 1;

  if v_company is null then
    raise exception 'Aucune entreprise trouvée : exécuter la migration du score d''abord.';
  end if;

  if v_user is null then
    raise exception 'Entreprise sans propriétaire : impossible de créer les actions.';
  end if;

  -- 30 actions : le préfixe TEST-SCORE permet un nettoyage ciblé.
  insert into public.report_actions (
    company_id, title, details, owner_id, created_by, status, priority, due_date
  )
  select
    v_company,
    'TEST-SCORE #' || i,
    'Donnée de test — score de conformité',
    v_user,
    v_user,
    case
      when i <= 12 then 'done'      -- à temps
      when i <= 18 then 'done'      -- en retard
      when i <= 24 then 'todo'
      when i <= 27 then 'doing'
      else 'cancelled'
    end,
    'normal',
    (current_date - (i * 3))::date
  from generate_series(1, 30) as i;

  get diagnostics v_made = row_count;

  -- Clôtures : à temps (échéance - 1 j) ou en retard (échéance + 2 j).
  update public.report_actions
  set completed_at = (due_date - interval '1 day')
  where title like 'TEST-SCORE #%'
    and status = 'done'
    and substring(title from '#(.*)')::int <= 12;

  update public.report_actions
  set completed_at = (due_date + interval '2 days')
  where title like 'TEST-SCORE #%'
    and status = 'done'
    and substring(title from '#(.*)')::int between 13 and 18;

  raise notice 'Actions de test créées : % (entreprise %)', v_made, v_company;
end $$;

-- ---------------------------------------------------------------------
-- 2. Vérification
-- ---------------------------------------------------------------------
select status, count(*) as total, count(completed_at) as avec_date
from public.report_actions
where title like 'TEST-SCORE #%'
group by status
order by status;

-- ---------------------------------------------------------------------
-- 3. Nettoyage (à exécuter quand les tests sont finis)
-- ---------------------------------------------------------------------
-- delete from public.report_actions where title like 'TEST-SCORE #%';
