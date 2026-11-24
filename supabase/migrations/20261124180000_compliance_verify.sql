-- =====================================================================
-- Vérification publique d'une attestation de conformité
--
-- À exécuter MANUELLEMENT après la migration du score.
-- N'expose QUE : nom de l'entreprise, score, période, date de calcul.
-- Jamais d'identifiant utilisateur, jamais de détail des critères.
-- =====================================================================

-- 1. Code de vérification, unique quand renseigné
alter table public.compliance_scores
  add column if not exists verify_code text;

create unique index if not exists compliance_scores_verify_code_idx
  on public.compliance_scores (verify_code)
  where verify_code is not null;

-- 2. Rattrapage des scores déjà calculés : 8 caractères dérivés de l'identifiant
update public.compliance_scores
set verify_code = upper(substr(replace(id::text, '-', ''), 1, 8))
where verify_code is null;

-- 3. Recherche publique — SECURITY DEFINER, donc lecture sans RLS,
--    mais projection strictement limitée aux champs publics.
create or replace function public.compliance_public_lookup(p_code text)
returns table (
  company_name text,
  score numeric,
  period_start date,
  period_end date,
  calculated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, s.score, s.period_start, s.period_end, s.calculated_at
  from public.compliance_scores s
  join public.companies c on c.id = s.entity_id
  where s.verify_code = upper(trim(p_code))
  order by s.calculated_at desc
  limit 1;
$$;

revoke all on function public.compliance_public_lookup(text) from public;
grant execute on function public.compliance_public_lookup(text) to anon, authenticated;

-- 4. Le serveur remplit le code à l'insertion suivante.
--    Les scores insérés sans code restent valides (colonne nullable),
--    mais ils ne seront pas vérifiables : le calcul doit désormais le fournir.
