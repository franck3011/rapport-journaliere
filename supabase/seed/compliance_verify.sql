-- =====================================================================
-- VÉRIFICATION DU MODULE « SCORE DE CONFORMITÉ »
--
-- Lecture seule. À lancer APRÈS la migration, sur la recette.
-- Une seule requête, un seul tableau : recopie le résultat.
-- =====================================================================

with
  tables as (
    select to_regclass('public.compliance_settings') as s,
           to_regclass('public.compliance_scores')   as c
  ),
  fonctions as (
    select count(*) as n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'app_private'
      and p.proname in (
        'compliance_is_member',
        'compliance_is_manager',
        'report_actions_sync_completed_at',
        'companies_create_compliance_settings'
      )
      and p.prosecdef            -- SECURITY DEFINER obligatoire
  ),
  triggers_actions as (
    select count(*) as n
    from pg_trigger
    where tgrelid = 'public.report_actions'::regclass
      and not tgisinternal
      and tgname = 'report_actions_sync_completed'
  ),
  reglages as (
    select
      (select count(*) from public.compliance_settings) as faites,
      (select count(*) from public.companies)           as entreprises
  ),
  politiques as (
    select
      count(*) filter (where cmd = 'SELECT') as lecture,
      count(*) filter (where cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) as ecriture
    from pg_policies
    where schemaname = 'public' and tablename = 'compliance_scores'
  ),
  droits as (
    select
      has_table_privilege('authenticated', 'public.compliance_scores', 'INSERT') as peut_inserer,
      has_table_privilege('authenticated', 'public.compliance_scores', 'SELECT') as peut_lire
  ),
  actions as (
    select count(*) as total, count(completed_at) as avec_date
    from public.report_actions
  )
select 'Tables créées' as controle, 'compliance_settings + compliance_scores' as attendu,
       case when t.s is not null and t.c is not null then 'OK' else 'MANQUANT' end as obtenu
from tables t

union all
select 'Fonctions SECURITY DEFINER', '4', f.n::text from fonctions f

union all
select 'Trigger de clôture', '1 seul sur report_actions', tr.n::text from triggers_actions tr

union all
select 'Réglages par entreprise', reg.entreprises::text, reg.faites::text from reglages reg

union all
select 'Politiques sur les scores', '1 lecture, 0 écriture',
       p.lecture::text || ' lecture / ' || p.ecriture::text || ' écriture'
from politiques p

union all
select 'Droits authenticated', 'insert false, select true',
       'insert ' || d.peut_inserer::text || ' / select ' || d.peut_lire::text
from droits d

union all
select 'Actions horodatées', 'les done doivent avoir une date',
       a.avec_date::text || ' / ' || a.total::text
from actions a;
