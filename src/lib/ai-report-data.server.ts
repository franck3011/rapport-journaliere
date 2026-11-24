/**
 * Contexte de données pour l'assistant de rédaction.
 *
 * L'assistant ne doit JAMAIS inventer les lignes d'un tableau : on lui fournit
 * les données réelles de l'entreprise (membres, rapports récents, actions,
 * objectifs), sous une forme compacte, pour qu'il construise les tableaux
 * à partir de faits vérifiables.
 */
export async function buildReportDataContext(
  supabase: any,
  userId: string,
): Promise<string> {
  const { data: mem } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  const companyId: string | undefined = mem?.company_id;

  const [members, reports, actions, objectives, expenses] = await Promise.all([
    companyId
      ? supabase
          .from("expense_reports")
          .select("title, category, amount, status, expense_date")
          .eq("company_id", companyId)
          .order("expense_date", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
    companyId
      ? supabase.from("company_members").select("user_id").eq("company_id", companyId)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("reports")
      .select("title, report_date, author_id")
      .order("report_date", { ascending: false })
      .limit(20),
    supabase
      .from("report_actions")
      .select("title, due_date, status, owner_id")
      .in("status", ["todo", "doing"])
      .limit(30),
    companyId
      ? supabase
          .from("objectives")
          .select("title, target_value, current_value, unit")
          .eq("company_id", companyId)
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const userIds = new Set<string>();
  ((members.data ?? []) as any[]).forEach((m) => userIds.add(m.user_id));
  ((reports.data ?? []) as any[]).forEach((r) => r.author_id && userIds.add(r.author_id));
  ((actions.data ?? []) as any[]).forEach((a) => a.owner_id && userIds.add(a.owner_id));

  const { data: profiles } = userIds.size
    ? await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", Array.from(userIds))
    : { data: [] as any[] };

  const nameOf = new Map<string, string>(
    ((profiles ?? []) as any[]).map((p) => [
      p.id,
      (p.full_name ?? "").trim() || "Membre sans nom",
    ]),
  );

  const lines: string[] = [];
  lines.push("DONNÉES RÉELLES DE L'ENTREPRISE (à utiliser pour remplir les tableaux) :");

  // Agrégat des dépenses : base des camemberts et histogrammes.
  const byCategory = new Map<string, number>();
  for (const row of ((expenses.data ?? []) as any[])) {
    const category = String(row.category ?? "Sans catégorie");
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(row.amount ?? 0));
  }
  lines.push(
    `- Dépenses par catégorie (montants réels) : ${
      Array.from(byCategory.entries())
        .map(([name, total]) => `${name} = ${total}`)
        .join(" ; ") || "aucune"
    }`,
  );

  const memberNames = Array.from(userIds)
    .map((id) => nameOf.get(id) ?? "Membre sans nom")
    .sort();
  lines.push(`- Membres (${memberNames.length}) : ${memberNames.join(", ") || "aucun"}`);

  const recentReports = ((reports.data ?? []) as any[]).slice(0, 12);
  lines.push(
    `- Rapports récents : ${
      recentReports
        .map((r) => `${r.report_date} « ${r.title ?? "sans titre"} » (${nameOf.get(r.author_id) ?? "?"})`)
        .join(" ; ") || "aucun"
    }`,
  );

  const openActions = (actions.data ?? []) as any[];
  lines.push(
    `- Actions ouvertes : ${
      openActions
        .map((a) => `${a.title}${a.due_date ? ` (échéance ${a.due_date})` : ""} — ${nameOf.get(a.owner_id) ?? "non assigné"}`)
        .join(" ; ") || "aucune"
    }`,
  );

  const objectivesList = (objectives.data ?? []) as any[];
  lines.push(
    `- Objectifs : ${
      objectivesList
        .map((o) => `${o.title} ${Number(o.current_value ?? 0)}/${Number(o.target_value ?? 0)} ${o.unit ?? ""}`)
        .join(" ; ") || "aucun"
    }`,
  );

  lines.push(
    "Règle absolue : un tableau ne contient QUE des lignes issues de ces données. " +
      "Si une information manque (par exemple le matériel d'un employé), laisse la cellule vide ou écris « à vérifier ». " +
      "N'invente jamais un nom, un numéro de série ou une valeur.",
  );

  return "\n\n" + lines.join("\n");
}
