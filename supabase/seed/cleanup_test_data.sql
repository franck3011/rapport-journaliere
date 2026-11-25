-- =====================================================================
-- NETTOYAGE DES DONNÉES DE TEST
--
-- À exécuter MANUELLEMENT, dans cet ordre :
--   1. le contrôle (lecture seule) — note les nombres
--   2. les suppressions, une par une, en vérifiant chaque résultat
--
-- Rien n'est supprimé automatiquement : chaque bloc est explicite.
-- Les motifs sont volontairement stricts (préfixes de test uniquement).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONTRÔLE — ce qui sera supprimé
-- ---------------------------------------------------------------------
select 'actions TEST-SCORE' as categorie, count(*) as lignes
from public.report_actions where title like 'TEST-SCORE #%'

union all
select 'rapports TEST', count(*)
from public.reports where title like 'TEST%' or title like '%— TEST%'

union all
select 'dépenses TEST ou orphelines', count(*)
from public.expense_reports
where title like 'TEST%' or (company_id is null and title = 'kjhj')

union all
select 'congés TEST', count(*)
from public.leave_requests
where exists (
  select 1 from public.profiles p
  where p.id = leave_requests.user_id and p.full_name like 'TEST%'
);

-- ---------------------------------------------------------------------
-- 2. SUPPRESSIONS — décommenter bloc par bloc
-- ---------------------------------------------------------------------

-- 2a. Actions du banc d'essai du score de conformité
-- delete from public.report_actions where title like 'TEST-SCORE #%';

-- 2b. Rapports de démonstration
-- delete from public.reports where title like 'TEST%' or title like '%— TEST%';

-- 2c. Dépenses de test et dépense orpheline (sans entreprise)
-- delete from public.expense_reports
-- where title like 'TEST%' or (company_id is null and title = 'kjhj');

-- ---------------------------------------------------------------------
-- 3. VÉRIFICATION APRÈS NETTOYAGE
-- ---------------------------------------------------------------------
select 'actions restantes' as categorie, count(*) as lignes from public.report_actions
union all
select 'rapports restants', count(*) from public.reports
union all
select 'dépenses restantes', count(*) from public.expense_reports;

-- ---------------------------------------------------------------------
-- 4. POINTS À DÉCIDER MANUELLEMENT (non traité ici)
--
--   • l'entreprise « demo » : la supprimer effacerait ses rapports,
--     ses membres et son historique. À faire seulement si c'est bien
--     une entreprise de test.
--
--   • reset des scores de conformité calculés pendant les essais :
--       delete from public.compliance_scores;   -- tout l'historique
--     À ne faire que si aucun score réel n'a été produit.
--
--   • anciennes tables inutilisées (departments, inventory_items) :
--     ne rien supprimer sans avoir vérifié qu'elles sont vides.
--       select count(*) from public.departments;
--       select count(*) from public.inventory_items;
-- ---------------------------------------------------------------------
