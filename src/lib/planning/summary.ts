import type { PlanItem } from "./planning.functions";

export type PlanSummary = {
  total: number;
  done: number;
  inProgress: number;
  planned: number;
  cancelled: number;
  /** travaux non terminés dont la date de fin est passée */
  late: PlanItem[];
  /** travaux terminés */
  doneItems: PlanItem[];
  /** travaux restants (prévus ou en cours) */
  remaining: PlanItem[];
  /** taux de réalisation 0-100 */
  rate: number;
};

export function summarizePlan(items: PlanItem[], today: string): PlanSummary {
  const doneItems = items.filter((i) => i.status === "done");
  const cancelled = items.filter((i) => i.status === "cancelled");
  const inProgress = items.filter((i) => i.status === "in_progress");
  const planned = items.filter((i) => i.status === "planned");

  const late = items.filter((i) => {
    if (i.status === "done" || i.status === "cancelled") return false;
    const end = i.end_date ?? i.planned_date;
    return end < today;
  });

  const remaining = items.filter((i) => i.status === "planned" || i.status === "in_progress");
  const denominator = items.length - cancelled.length;

  return {
    total: items.length,
    done: doneItems.length,
    inProgress: inProgress.length,
    planned: planned.length,
    cancelled: cancelled.length,
    late,
    doneItems,
    remaining,
    rate: denominator > 0 ? Math.round((doneItems.length / denominator) * 100) : 0,
  };
}

export function planLine(item: PlanItem): string {
  const period =
    item.end_date && item.end_date !== item.planned_date
      ? `du ${frDate(item.planned_date)} au ${frDate(item.end_date)}`
      : frDate(item.planned_date);
  return `${item.title} — ${item.owner_name} — ${period}`;
}

export function frDate(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
