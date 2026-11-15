#!/usr/bin/env node
/**
 * Sauvegarde de la base DailyBrief.
 *
 *   node scripts/backup-db.mjs
 *
 * Variables d'environnement attendues :
 *   DATABASE_URL      chaîne de connexion Postgres (pooler Supabase recommandé)
 *   BACKUP_DIR        dossier de destination (défaut : ./backups)
 *   BACKUP_KEEP       nombre de sauvegardes conservées (défaut : 7)
 *
 * Le script produit un fichier SQL restaurable par table, plus un manifeste
 * (nombre de lignes, date, version). Il ne dépend d'aucun binaire externe :
 * pas besoin de pg_dump.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL manquant.");
  console.error(
    "Exemple : postgresql://postgres.<ref>:<mot-de-passe>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?sslmode=require",
  );
  process.exit(1);
}

const OUT_ROOT = path.resolve(process.env.BACKUP_DIR ?? "backups");
const KEEP = Number(process.env.BACKUP_KEEP ?? "7");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(OUT_ROOT, stamp);

function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") {
    return quote(JSON.stringify(value));
  }
  return quote(String(value));
}

function quote(text) {
  if (text.includes("\\")) {
    return `E'${text.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }
  return `'${text.replace(/'/g, "''")}'`;
}

const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });

try {
  fs.mkdirSync(outDir, { recursive: true });

  const tables = await sql.unsafe(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);

  const manifest = { createdAt: new Date().toISOString(), tables: {} };
  const parts = [
    "-- Sauvegarde DailyBrief",
    `-- ${new Date().toISOString()}`,
    "-- Restauration : psql \"$DATABASE_URL\" -f backup.sql",
    "",
    "set session_replication_role = replica;",
    "",
  ];

  for (const { table_name: table } of tables) {
    const rows = await sql.unsafe(`select * from public."${table}"`);
    manifest.tables[table] = rows.length;

    parts.push(`-- ${table} : ${rows.length} ligne(s)`);
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      const columnList = columns.map((c) => `"${c}"`).join(", ");

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const values = batch
          .map((row) => `(${columns.map((c) => literal(row[c])).join(", ")})`)
          .join(",\n  ");
        parts.push(
          `insert into public."${table}" (${columnList}) values\n  ${values}\non conflict do nothing;`,
        );
      }
    }
    parts.push("");
    console.log(`  ${table.padEnd(28)} ${String(rows.length).padStart(6)} lignes`);
  }

  parts.push("set session_replication_role = default;", "");

  fs.writeFileSync(path.join(outDir, "backup.sql"), parts.join("\n"), "utf8");
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  const size = fs.statSync(path.join(outDir, "backup.sql")).size;
  console.log(
    `\nSauvegarde terminee : ${Object.keys(manifest.tables).length} tables, ${total} lignes, ${(size / 1024 / 1024).toFixed(1)} Mo`,
  );
  console.log(`  ${path.join(outDir, "backup.sql")}`);

  // Rotation : on ne garde que les N dernieres sauvegardes.
  const existing = fs
    .readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const excess = existing.length - KEEP;
  if (excess > 0) {
    for (const name of existing.slice(0, excess)) {
      fs.rmSync(path.join(OUT_ROOT, name), { recursive: true, force: true });
      console.log(`  ancienne sauvegarde supprimee : ${name}`);
    }
  }
} catch (error) {
  console.error("\nEchec de la sauvegarde :", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
