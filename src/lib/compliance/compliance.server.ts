/**
 * Calcul du score de conformité.
 *
 * Règles :
 *  - lit avec la session de l'utilisateur (la RLS s'applique) ;
 *  - n'invente aucune date : une action terminée sans `completed_at` est
 *    ÉCARTÉE et comptée dans `excluded_actions` (option B) ;
 *  - les actions `cancelled` ne sont ni des réussites ni des retards ;
 *  - enregistre un instantané des réglages, pour que deux scores restent
 *    comparables même si les pondérations changent ensuite.
 */

export type ComplianceSettings = {
  weight_punctuality: number;
  weight_completeness: number;
  weight_incidents: number;
  weight_regularity: number;
  report_due_hour: number;
  incident_sla_days: number;
  grace_days: number;
  done_statuses: string[];
  open_statuses: string[];
  min_sample: number;
};

export type CriteriaDetail = {
  value: number;
  weight: number;
  points: number;
  numerator: number;
  denominator: number;
};

export type ComplianceResult = {
  score: number;
  insufficient: boolean;
  details: {
    settings: Record<string, unknown>;
    punctuality: CriteriaDetail;
    completeness: CriteriaDetail;
    incidents: CriteriaDetail;
    regularity: CriteriaDetail;
    measurable_actions: number;
    excluded_actions: number;
    excluded_cancelled: number;
    reports_count: number;
    period: { start: string; end: string };
  };
};

function points(value: number, weight: number): number {
  return Math.round(((value / 100) * weight + Number.EPSILON) * 100) / 100;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function computeCompliance(
  supabase: any,
  companyId: string,
  settings: ComplianceSettings,
  periodStart: string,
  periodEnd: string,
): Promise<ComplianceResult> {
  // --- Rapports de la période -------------------------------------------------
  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_date, created_at, intro")
    .gte("report_date", periodStart)
    .lte("report_date", periodEnd)
    .limit(2000);
  const reportRows = (reports ?? []) as any[];

  // Ponctualité : déposé le jour même avant l'heure limite (avec tolérance).
  let punctual = 0;
  for (const row of reportRows) {
    const created = new Date(row.created_at);
    const createdDay = created.toISOString().slice(0, 10);
    const limit = new Date(`${row.report_date}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + settings.grace_days);
    limit.setUTCHours(settings.report_due_hour, 0, 0, 0);
    if (createdDay <= row.report_date || created <= limit) punctual++;
  }

  // Complétude : intro fournie, au moins 2 sections, au moins 3 points.
  const reportIds = reportRows.map((r) => r.id);
  let complete = 0;
  if (reportIds.length) {
    const { data: sections } = await supabase
      .from("report_sections")
      .select("id, report_id, description")
      .in("report_id", reportIds);
    const sectionRows = (sections ?? []) as any[];

    const { data: bullets } = sectionRows.length
      ? await supabase
          .from("section_bullets")
          .select("id, section_id")
          .in("section_id", sectionRows.map((s) => s.id))
      : { data: [] as any[] };
    const bulletRows = (bullets ?? []) as any[];

    for (const report of reportRows) {
      const own = sectionRows.filter((s) => s.report_id === report.id);
      const bulletCount = bulletRows.filter((b) =>
        own.some((s) => s.id === b.section_id),
      ).length;
      const hasIntro = String(report.intro ?? "").trim().length >= 20;
      if (hasIntro && own.length >= 2 && bulletCount >= 3) complete++;
    }
  }

  // Incidents : actions terminées, dans le délai, hors annulées.
  const { data: actions } = await supabase
    .from("report_actions")
    .select("id, status, due_date, completed_at")
    .eq("company_id", companyId)
    .limit(5000);
  const actionRows = (actions ?? []) as any[];

  const cancelled = actionRows.filter((a) => a.status === "cancelled").length;
  const doneWithDate = actionRows.filter(
    (a) => a.status === "done" && a.completed_at,
  );
  const excluded = actionRows.filter((a) => a.status === "done" && !a.completed_at).length;

  let inTime = 0;
  for (const action of doneWithDate) {
    if (!action.due_date) continue;
    const completed = new Date(action.completed_at).toISOString().slice(0, 10);
    if (completed <= action.due_date) inTime++;
  }

  // Régularité : jours distincts avec au moins un rapport / jours de la période.
  const daysWithReport = new Set(reportRows.map((r) => r.report_date)).size;
  const start = new Date(`${periodStart}T00:00:00Z`).getTime();
  const end = new Date(`${periodEnd}T00:00:00Z`).getTime();
  const periodDays = Math.max(1, Math.round((end - start) / 86400000) + 1);

  const measurable = doneWithDate.filter((a) => a.due_date).length;

  const punctuality = pct(punctual, reportRows.length);
  const completeness = pct(complete, reportRows.length);
  const incidents = pct(inTime, measurable);
  const regularity = pct(daysWithReport, Math.min(periodDays, 30));

  const details = {
    settings: {
      weight_punctuality: settings.weight_punctuality,
      weight_completeness: settings.weight_completeness,
      weight_incidents: settings.weight_incidents,
      weight_regularity: settings.weight_regularity,
      report_due_hour: settings.report_due_hour,
      incident_sla_days: settings.incident_sla_days,
      grace_days: settings.grace_days,
      min_sample: settings.min_sample,
    },
    punctuality: {
      value: punctuality,
      weight: settings.weight_punctuality,
      points: points(punctuality, settings.weight_punctuality),
      numerator: punctual,
      denominator: reportRows.length,
    },
    completeness: {
      value: completeness,
      weight: settings.weight_completeness,
      points: points(completeness, settings.weight_completeness),
      numerator: complete,
      denominator: reportRows.length,
    },
    incidents: {
      value: incidents,
      weight: settings.weight_incidents,
      points: points(incidents, settings.weight_incidents),
      numerator: inTime,
      denominator: measurable,
    },
    regularity: {
      value: regularity,
      weight: settings.weight_regularity,
      points: points(regularity, settings.weight_regularity),
      numerator: daysWithReport,
      denominator: Math.min(periodDays, 30),
    },
    measurable_actions: measurable,
    excluded_actions: excluded,
    excluded_cancelled: cancelled,
    reports_count: reportRows.length,
    period: { start: periodStart, end: periodEnd },
  };

  const score =
    Math.round(
      (details.punctuality.points +
        details.completeness.points +
        details.incidents.points +
        details.regularity.points +
        Number.EPSILON) *
        100,
    ) / 100;

  // Sans assez d'actions mesurables, le score n'est pas publié comme fiable.
  const insufficient = measurable < settings.min_sample && settings.min_sample > 0;

  return { score, insufficient, details };
}
