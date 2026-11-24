/**
 * Métriques calculées par l'application, jamais par l'IA.
 *
 * L'assistant ne fournit que le nom de la métrique, la période et le
 * regroupement ; ce module lit la base et produit les séries. Un graphique ne
 * peut donc pas afficher de chiffres inventés.
 */

export const METRICS = [
  "reports_count",
  "actions_open_count",
  "actions_done_count",
  "expenses_total",
  "expenses_by_category",
  "reports_by_author",
] as const;

export type MetricName = (typeof METRICS)[number];

export const PERIODS = [
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "current_month",
] as const;

export type MetricPeriod = (typeof PERIODS)[number];

export type MetricSeries = { label: string; value: number };

function periodStart(period: MetricPeriod): Date {
  const now = new Date();
  if (period === "current_month") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = period === "last_7_days" ? 7 : period === "last_30_days" ? 30 : 90;
  return new Date(now.getTime() - days * 86400000);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekKey(date: Date): string {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Calcule une série pour la métrique demandée.
 * Renvoie [] si la métrique est inconnue ou sans donnée : l'appelant décide.
 */
export async function computeMetric(
  supabase: any,
  companyId: string | null,
  metric: string,
  period: MetricPeriod,
  groupBy: string,
): Promise<MetricSeries[]> {
  const start = periodStart(period).toISOString();
  const bucket =
    groupBy === "week" ? weekKey : groupBy === "month" ? monthKey : dayKey;

  if (metric === "reports_count" || metric === "reports_by_author") {
    const { data } = await supabase
      .from("reports")
      .select("id, report_date, author_id")
      .gte("created_at", start)
      .limit(1000);
    const rows = (data ?? []) as any[];

    if (metric === "reports_by_author") {
      const counts = new Map<string, number>();
      rows.forEach((row) => counts.set(row.author_id, (counts.get(row.author_id) ?? 0) + 1));
      const ids = Array.from(counts.keys());
      const { data: people } = ids.length
        ? await supabase.from("profiles_public").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      const names = new Map<string, string>(
        ((people ?? []) as any[]).map((p) => [p.id, p.full_name ?? "Membre"]),
      );
      return Array.from(counts.entries()).map(([id, value]) => ({
        label: names.get(id) ?? "Membre",
        value,
      }));
    }

    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const key = bucket(new Date(row.report_date ?? row.created_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
  }

  if (metric === "actions_open_count" || metric === "actions_done_count") {
    const status = metric === "actions_done_count" ? "done" : "todo";
    const { data } = await supabase
      .from("report_actions")
      .select("id, status, created_at")
      .eq("status", status)
      .limit(1000);
    const counts = new Map<string, number>();
    ((data ?? []) as any[]).forEach((row) => {
      const key = bucket(new Date(row.created_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
  }

  if (metric === "expenses_total" || metric === "expenses_by_category") {
    if (!companyId) return [];
    const { data } = await supabase
      .from("expense_reports")
      .select("id, amount, category, expense_date")
      .eq("company_id", companyId)
      .gte("expense_date", start.slice(0, 10))
      .limit(1000);
    const rows = (data ?? []) as any[];

    if (metric === "expenses_by_category") {
      const totals = new Map<string, number>();
      rows.forEach((row) => {
        const key = String(row.category ?? "Sans catégorie");
        totals.set(key, (totals.get(key) ?? 0) + Number(row.amount ?? 0));
      });
      return Array.from(totals.entries()).map(([label, value]) => ({ label, value }));
    }

    const totals = new Map<string, number>();
    rows.forEach((row) => {
      const key = bucket(new Date(row.expense_date));
      totals.set(key, (totals.get(key) ?? 0) + Number(row.amount ?? 0));
    });
    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
  }

  return [];
}
