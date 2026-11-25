#!/usr/bin/env node
/**
 * Outils base de données — à lancer depuis le dossier du projet.
 *
 *   node scripts/db-tools.mjs fix      -> applique les corrections en attente
 *   node scripts/db-tools.mjs schema   -> exporte les tables sans migration
 *   node scripts/db-tools.mjs check    -> contrôle l'état (lecture seule)
 *
 * La chaîne de connexion est lue dans, par ordre de priorité :
 *   process.env.DATABASE_URL
 *   backup.env   (clé DATABASE_URL=...)
 *   .env         (clé DATABASE_URL=...)
 *
 * Elle n'est jamais affichée ni écrite dans le dépôt.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function readEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  const match = content.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return readEnvFile("backup.env") ?? readEnvFile(".env");
}

const TARGETS = {
  plans: `
    update public.subscription_plans
    set monthly_price_cents = 1500000,
        yearly_price_cents = 14400000,
        price_per_extra_seat_cents = 200000,
        features = '["rapports","actions","objectifs","export_excel","conformite","inventaire","agenda"]'::jsonb
    where code = 'pro';

    update public.subscription_plans
    set monthly_price_cents = 3500000,
        yearly_price_cents = 33600000,
        price_per_extra_seat_cents = 150000,
        features = '["rapports","actions","objectifs","messagerie","export_excel","roles_audit","support_prioritaire","conformite","inventaire","agenda"]'::jsonb
    where code = 'business';
  `,
  verify: `
    alter table public.compliance_scores add column if not exists verify_code text;

    create unique index if not exists compliance_scores_verify_code_idx
      on public.compliance_scores (verify_code) where verify_code is not null;

    update public.compliance_scores
    set verify_code = upper(substr(replace(id::text, '-', ''), 1, 8))
    where verify_code is null;

    create or replace function public.compliance_public_lookup(p_code text)
    returns table (company_name text, score numeric, period_start date, period_end date, calculated_at timestamptz)
    language sql stable security definer set search_path = ''
    as $$
      select c.name, s.score, s.period_start, s.period_end, s.calculated_at
      from public.compliance_scores s
      join public.companies c on c.id = s.entity_id
      where s.verify_code = upper(trim(p_code))
      order by s.calculated_at desc limit 1;
    $$;

    grant execute on function public.compliance_public_lookup(text) to anon, authenticated;
  `,
  agenda: `
    create table if not exists public.company_agenda_events (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references public.companies(id) on delete cascade,
      title text not null check (length(trim(title)) > 0),
      kind text not null default 'autre'
        check (kind in ('rapport','mail','reunion','relance','autre')),
      event_date date not null,
      event_time time,
      recurrence text not null default 'none'
        check (recurrence in ('none','daily','weekly','monthly')),
      notes text not null default '',
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists company_agenda_events_date_idx
      on public.company_agenda_events (company_id, event_date);

    alter table public.company_agenda_events enable row level security;

    drop policy if exists company_agenda_events_member on public.company_agenda_events;
    create policy company_agenda_events_member on public.company_agenda_events
      for all to authenticated
      using (app_private.compliance_is_member(company_id))
      with check (app_private.compliance_is_member(company_id));
  `,
};

async function fix(sql) {
  console.log("→ Tarifs des formules…");
  await sql.unsafe(TARGETS.plans);
  console.log("→ Vérification publique des attestations…");
  await sql.unsafe(TARGETS.verify);
  console.log("→ Table de l'agenda…");
  await sql.unsafe(TARGETS.agenda);

  const plans = await sql`
    select code, monthly_price_cents, yearly_price_cents,
           jsonb_array_length(coalesce(features, '[]'::jsonb)) as features
    from public.subscription_plans order by sort_order
  `;
  console.table(plans);

  const [{ count: scores }] = await sql`
    select count(*)::int as count from public.compliance_scores where verify_code is not null
  `;
  console.log(`Scores avec code de vérification : ${scores}`);
}

async function check(sql) {
  const rows = await sql`
    select
      (select count(*)::int from public.companies) as entreprises,
      (select count(*)::int from public.reports) as rapports,
      (select count(*)::int from public.report_actions) as actions,
      (select count(*)::int from public.compliance_scores) as scores,
      (select count(*)::int from public.company_agenda_events) as agenda
  `;
  console.table(rows);

  const plans = await sql`
    select code, name, monthly_price_cents from public.subscription_plans order by sort_order
  `;
  console.table(plans);
}

async function schema(sql) {
  // Tables utilisées par le code mais absentes des migrations.
  const wanted = [
    "documents",
    "expense_reports",
    "agent_tasks",
    "ai_agents",
    "report_runs",
    "report_run_audit_logs",
    "company_chat_messages",
  ];

  const columns = await sql`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = any(${wanted})
    order by table_name, ordinal_position
  `;

  const byTable = new Map();
  for (const row of columns) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, []);
    byTable.get(row.table_name).push(row);
  }

  let out = `-- Schéma des tables présentes en base mais absentes des migrations\n`;
  out += `-- Généré le ${new Date().toISOString()} — À VÉRIFIER avant exécution.\n\n`;

  for (const [table, cols] of byTable) {
    out += `create table if not exists public.${table} (\n`;
    out += cols
      .map((c) => {
        const nullable = c.is_nullable === "YES" ? "" : " not null";
        const def = c.column_default ? ` default ${c.column_default}` : "";
        return `  ${c.column_name} ${c.data_type}${def}${nullable}`;
      })
      .join(",\n");
    out += `\n);\n\n`;
  }

  const path = resolve(process.cwd(), "supabase/seed/schema_manquant.sql");
  writeFileSync(path, out, "utf8");
  console.log(`Écrit : ${path} (${byTable.size} tables)`);
}

const command = process.argv[2] ?? "check";
const url = connectionString();

if (!url) {
  console.error(
    "Aucune chaîne de connexion.\n" +
      "Crée un fichier backup.env à la racine du projet contenant :\n" +
      "DATABASE_URL=postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres",
  );
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  if (command === "fix") await fix(sql);
  else if (command === "schema") await schema(sql);
  else await check(sql);
} catch (error) {
  console.error("Échec :", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
