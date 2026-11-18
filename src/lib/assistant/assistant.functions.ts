import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Assistant d'entreprise — première étape : il COMPREND la question, choisit
 * un outil dans l'application, l'exécute, puis répond avec les vrais chiffres.
 *
 * Le modèle ne calcule rien : il choisit l'outil. Les données viennent de la
 * base, filtrées par les règles d'accès de l'utilisateur.
 */

export type AssistantTool =
  | "rapports_recents"
  | "actions_ouvertes"
  | "objectifs"
  | "plannings"
  | "membres_silencieux"
  | "aucun";

export type AssistantAnswer = {
  answer: string;
  tool: AssistantTool;
  data: any;
};

const DECISION_SYSTEM = `Tu es l'assistant d'une application de rapports d'entreprise.
Tu reçois une question en français. Tu dois choisir UN SEUL outil pour y répondre.

Outils disponibles :
- "rapports_recents" : les derniers rapports publiés (titres, dates, auteurs).
- "actions_ouvertes" : les actions en cours assignées à l'utilisateur, avec les retards.
- "objectifs" : les objectifs de l'entreprise avec le réalisé et la cible.
- "plannings" : les plannings (documents de prévision) récents.
- "membres_silencieux" : les membres de l'équipe qui n'ont pas publié de rapport cette semaine.
- "aucun" : la question ne demande aucune donnée de l'application (salutation, question générale).

Réponds UNIQUEMENT par un objet JSON :
{ "tool": "<nom de l'outil>", "raison": "<une phrase courte>" }`;

const ANSWER_SYSTEM = `Tu es l'assistant d'une application de rapports d'entreprise.
On te donne une question, l'outil utilisé et son résultat.

Réponds en français, en 1 à 4 phrases, avec les chiffres exacts du résultat.
- Ne mentionne jamais le nom technique de l'outil ni le format JSON.
- Si le résultat est vide, dis-le simplement et propose une action concrète.
- Si l'outil est "aucun", réponds normalement à la question, brièvement.
- Ton professionnel, direct, sans emphase.`;

async function executeTool(
  tool: AssistantTool,
  supabase: any,
  userId: string,
): Promise<unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: mem } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  const companyId: string | undefined = mem?.company_id;

  if (tool === "rapports_recents") {
    const { data } = await supabase
      .from("reports")
      .select("title, report_date, intro, doc_type")
      .order("report_date", { ascending: false })
      .limit(5);
    return (data ?? []).map((r: any) => ({
      titre: r.title,
      date: r.report_date,
      type: r.doc_type === "plan" ? "planning" : "rapport",
    }));
  }

  if (tool === "actions_ouvertes") {
    const { data } = await supabase
      .from("report_actions")
      .select("title, due_date, status, priority")
      .eq("owner_id", userId)
      .in("status", ["todo", "doing"])
      .order("due_date", { ascending: true })
      .limit(10);
    const rows = (data ?? []) as any[];
    return {
      total: rows.length,
      en_retard: rows.filter((r) => r.due_date && r.due_date < today).length,
      elements: rows.map((r) => ({
        titre: r.title,
        echeance: r.due_date,
        statut: r.status,
        priorite: r.priority,
      })),
    };
  }

  if (tool === "objectifs") {
    if (!companyId) return { total: 0, elements: [] };
    const { data } = await supabase
      .from("objectives")
      .select("title, target_value, current_value, unit, period_start, period_end")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false })
      .limit(10);
    return {
      total: (data ?? []).length,
      elements: ((data ?? []) as any[]).map((o) => ({
        intitule: o.title,
        realise: Number(o.current_value ?? 0),
        cible: Number(o.target_value ?? 0),
        unite: o.unit || "",
      })),
    };
  }

  if (tool === "plannings") {
    const { data } = await supabase
      .from("reports")
      .select("title, report_date")
      .eq("doc_type", "plan")
      .order("report_date", { ascending: false })
      .limit(5);
    return (data ?? []).map((r: any) => ({ titre: r.title, date: r.report_date }));
  }

  if (tool === "membres_silencieux") {
    if (!companyId) return { total: 0, noms: [] };
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId);
    const ids = ((members ?? []) as any[]).map((m) => m.user_id);

    const { data: recent } = await supabase
      .from("reports")
      .select("author_id")
      .gte("report_date", weekAgo);
    const active = new Set(((recent ?? []) as any[]).map((r) => r.author_id));

    const silent = ids.filter((id: string) => !active.has(id));
    let noms: string[] = [];
    if (silent.length > 0) {
      const { data: profs } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", silent.slice(0, 20));
      noms = ((profs ?? []) as any[]).map((p) => p.full_name || "Utilisateur");
    }
    return { total: silent.length, noms };
  }

  return null;
}

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ message: z.string().trim().min(1, "Message vide").max(2000) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<AssistantAnswer> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const { callAI, parseJsonLoose } = await import("@/lib/ai-gateway.server");

    // 1. Choisir l'outil
    const decisionRaw = await callAI({
      system: DECISION_SYSTEM,
      messages: [{ role: "user", content: data.message }],
      json: true,
      temperature: 0,
    });

    let tool: AssistantTool = "aucun";
    try {
      const parsed = parseJsonLoose<any>(decisionRaw);
      const candidate = String(parsed?.tool ?? "aucun");
      const allowed: AssistantTool[] = [
        "rapports_recents",
        "actions_ouvertes",
        "objectifs",
        "plannings",
        "membres_silencieux",
        "aucun",
      ];
      if (allowed.includes(candidate as AssistantTool)) tool = candidate as AssistantTool;
    } catch {
      tool = "aucun";
    }

    // 2. Exécuter
    let result: any = null;
    try {
      result = await executeTool(tool, supabase, userId);
    } catch (e) {
      result = { erreur: e instanceof Error ? e.message : "Lecture impossible" };
    }

    // 3a. Question générale : on délègue à l'assistante transversale existante
    // (projets, GED, notes de frais). Les deux assistants collaborent au lieu
    // de se contredire.
    if (tool === "aucun") {
      const { answerGlobally } = await import("@/lib/global-ai.server");
      const reply = await answerGlobally({
        supabase,
        userId,
        message: data.message,
      });
      return { answer: reply.trim(), tool, data: null };
    }

    // 3b. Répondre avec les données réelles
    const answerRaw = await callAI({
      system: ANSWER_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            question: data.message,
            outil: tool,
            resultat: result,
          }).slice(0, 20000),
        },
      ],
      temperature: 0.3,
    });

    return { answer: answerRaw.trim(), tool, data: result };
  });
