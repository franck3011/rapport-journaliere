import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Agent d'entreprise — il LIT et il ÉCRIT.
 *
 * Deux passages IA :
 *  1. choisir un outil et ses arguments ;
 *  2. répondre à partir du résultat réel.
 * Les données viennent de la base, filtrées par les droits de l'utilisateur.
 */

export type AssistantTool =
  | "rapports_recents"
  | "actions_ouvertes"
  | "objectifs"
  | "plannings"
  | "membres_silencieux"
  | "creer_rapport"
  | "creer_planning"
  | "creer_action"
  | "cloturer_action"
  | "creer_objectif"
  | "aucun";

export type AssistantAnswer = {
  answer: string;
  tool: AssistantTool;
  data: any;
};

type Section = { title: string; bullets: string[]; description?: string };

const DECISION_SYSTEM = `Tu es l'agent d'une application de rapports d'entreprise.
Tu reçois une demande en français. Tu choisis UN SEUL outil et tu fournis ses arguments.

LECTURE
- "rapports_recents" : derniers rapports publiés. args : {}
- "actions_ouvertes" : actions en cours de l'utilisateur. args : {}
- "objectifs" : objectifs de l'entreprise, réalisé vs cible. args : {}
- "plannings" : plannings récents. args : {}
- "membres_silencieux" : membres sans rapport cette semaine. args : {}

ÉCRITURE
- "creer_rapport" : crée un rapport (brouillon).
  args : { "titre": string, "introduction": string, "conclusion": string,
           "sections": [{ "titre": string, "points": [string], "description": "<texte libre ; pour un tableau utilise le format markdown | a | b |>" }] }
- "creer_planning" : crée un planning (document de prévision).
  args : { "titre": string, "introduction": string, "conclusion": string,
           "du": "AAAA-MM-JJ", "au": "AAAA-MM-JJ",
           "sections": [{ "titre": string, "points": [string], "description": "<texte libre ; pour un tableau utilise le format markdown | a | b |>" }] }
- "creer_action" : crée une action à suivre.
  args : { "titre": string, "details": string, "responsable": string,
           "echeance": "AAAA-MM-JJ", "priorite": "normal"|"high"|"urgent" }
- "cloturer_action" : marque une action comme terminée.
  args : { "recherche": string }
- "creer_objectif" : fixe un objectif.
  args : { "intitule": string, "cible": number, "unite": string,
           "du": "AAAA-MM-JJ", "au": "AAAA-MM-JJ" }
- "aucun" : la demande ne relève d'aucun outil (salutation, question générale). args : {}

Règles de rédaction pour les créations :
- Tu structures ce que l'utilisateur a demandé. Tu n'inventes aucun chiffre, aucun nom,
  aucun événement absent de sa demande.
- Si une date manque, utilise aujourd'hui ou la fin de la semaine en cours.
- Rédige en français professionnel, phrases courtes.

Réponds UNIQUEMENT par un objet JSON :
{ "tool": "<nom>", "args": { ... } }`;

const ANSWER_SYSTEM = `Tu es l'agent d'une application de rapports d'entreprise.
On te donne la demande, l'outil utilisé et son résultat.

Réponds en français, en 1 à 4 phrases, avec les chiffres exacts du résultat.
- Pour une création réussie, confirme ce qui a été créé et rappelle où le trouver.
- Pour une erreur, explique simplement ce qui a bloqué et propose une correction.
- Ne mentionne jamais le nom technique de l'outil ni le format JSON.
- Ton professionnel, direct, sans emphase.`;

/* ------------------------------- outils --------------------------------- */

const today = () => new Date().toISOString().slice(0, 10);
const weekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

function cleanSections(raw: any): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 12)
    .map((section: any) => ({
      title: String(section?.titre ?? section?.title ?? "").slice(0, 200),
      description: String(section?.description ?? "").slice(0, 4000),
      bullets: (Array.isArray(section?.points ?? section?.bullets) ? (section.points ?? section.bullets) : [])
        .map((bullet: any) => String(bullet ?? "").trim())
        .filter(Boolean)
        .slice(0, 40),
    }))
    .filter((section) => section.title || section.bullets.length > 0);
}

async function insertReport(
  supabase: any,
  userId: string,
  payload: {
    title: string;
    intro: string;
    conclusion: string;
    sections: Section[];
    docType: "report" | "plan";
    reportDate: string;
  },
): Promise<{ id: string }> {
  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      author_id: userId,
      report_date: payload.reportDate,
      title: payload.title,
      intro: payload.intro,
      conclusion: payload.conclusion,
      doc_type: payload.docType,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (payload.sections.length > 0) {
    const { data: inserted, error: sectionError } = await supabase
      .from("report_sections")
      .insert(
        payload.sections.map((section, index) => ({
          report_id: report.id,
          title: section.title,
          description: section.description ?? "",
          position: index,
        })),
      )
      .select("id");
    if (sectionError) throw new Error(sectionError.message);

    const bullets: any[] = [];
    payload.sections.forEach((section, index) => {
      const sectionId = (inserted ?? [])[index]?.id;
      if (!sectionId) return;
      section.bullets.forEach((content, position) => {
        bullets.push({ section_id: sectionId, content, position });
      });
    });
    if (bullets.length > 0) {
      const { error: bulletError } = await supabase.from("section_bullets").insert(bullets);
      if (bulletError) throw new Error(bulletError.message);
    }
  }

  return { id: report.id };
}

async function executeTool(
  tool: AssistantTool,
  args: any,
  supabase: any,
  userId: string,
): Promise<any> {
  const { data: mem } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  const companyId: string | undefined = mem?.company_id;

  /* ------------------------------ lecture ------------------------------ */

  if (tool === "rapports_recents") {
    const { data } = await supabase
      .from("reports")
      .select("title, report_date, doc_type")
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
      en_retard: rows.filter((r) => r.due_date && r.due_date < today()).length,
      elements: rows.map((r) => ({ titre: r.title, echeance: r.due_date, priorite: r.priority })),
    };
  }

  if (tool === "objectifs") {
    if (!companyId) return { total: 0, elements: [] };
    const { data } = await supabase
      .from("objectives")
      .select("title, target_value, current_value, unit")
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
      .gte("report_date", weekAgo());
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

  /* ------------------------------ écriture ----------------------------- */

  if (tool === "creer_rapport") {
    const title = String(args?.titre ?? "").trim();
    if (title.length < 3) throw new Error("Il manque un titre pour le rapport.");
    return insertReport(supabase, userId, {
      title,
      intro: String(args?.introduction ?? ""),
      conclusion: String(args?.conclusion ?? ""),
      sections: cleanSections(args?.sections),
      docType: "report",
      reportDate: today(),
    });
  }

  if (tool === "creer_planning") {
    const title = String(args?.titre ?? "").trim();
    if (title.length < 3) throw new Error("Il manque un titre pour le planning.");
    return insertReport(supabase, userId, {
      title,
      intro: String(args?.introduction ?? ""),
      conclusion: String(args?.conclusion ?? ""),
      sections: cleanSections(args?.sections),
      docType: "plan",
      reportDate: /^\d{4}-\d{2}-\d{2}$/.test(String(args?.du ?? "")) ? String(args.du) : today(),
    });
  }

  if (tool === "creer_action") {
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");
    const title = String(args?.titre ?? "").trim();
    if (title.length < 3) throw new Error("Il manque un titre pour l'action.");

    let ownerId = userId;
    const responsable = String(args?.responsable ?? "").trim();
    if (responsable) {
      const { data: found } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .ilike("full_name", `%${responsable}%`)
        .limit(1)
        .maybeSingle();
      if (found?.id) ownerId = found.id;
    }

    const priority = ["normal", "high", "urgent"].includes(String(args?.priorite))
      ? String(args.priorite)
      : "normal";

    const { error } = await supabase.from("report_actions").insert({
      company_id: companyId,
      title,
      details: String(args?.details ?? ""),
      owner_id: ownerId,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(args?.echeance ?? ""))
        ? String(args.echeance)
        : null,
      priority,
      status: "todo",
      created_by: userId,
      source: "ai",
    });
    if (error) throw new Error(error.message);
    return { cree: true, titre: title, responsable: ownerId === userId ? "vous" : responsable };
  }

  if (tool === "cloturer_action") {
    const recherche = String(args?.recherche ?? "").trim();
    if (recherche.length < 2) throw new Error("Précisez quelle action clôturer.");
    const { data: found } = await supabase
      .from("report_actions")
      .select("id, title")
      .eq("owner_id", userId)
      .in("status", ["todo", "doing"])
      .ilike("title", `%${recherche}%`)
      .limit(1)
      .maybeSingle();
    if (!found) throw new Error(`Aucune action ouverte ne correspond à « ${recherche} ».`);

    const { error } = await supabase
      .from("report_actions")
      .update({ status: "done" })
      .eq("id", found.id);
    if (error) throw new Error(error.message);
    return { cloturee: true, titre: found.title };
  }

  if (tool === "creer_objectif") {
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");
    const intitule = String(args?.intitule ?? "").trim();
    const cible = Number(args?.cible);
    if (intitule.length < 3) throw new Error("Il manque un intitulé pour l'objectif.");
    if (!Number.isFinite(cible) || cible <= 0) throw new Error("La cible doit être un nombre positif.");

    const start = new Date();
    const du = /^\d{4}-\d{2}-\d{2}$/.test(String(args?.du ?? ""))
      ? String(args.du)
      : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const au = /^\d{4}-\d{2}-\d{2}$/.test(String(args?.au ?? ""))
      ? String(args.au)
      : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

    const { error } = await supabase.from("objectives").insert({
      company_id: companyId,
      owner_id: null,
      title: intitule,
      kind: "manual",
      target_value: cible,
      current_value: 0,
      unit: String(args?.unite ?? ""),
      period_start: du,
      period_end: au,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { cree: true, intitule, cible };
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

    const ALLOWED: AssistantTool[] = [
      "rapports_recents",
      "actions_ouvertes",
      "objectifs",
      "plannings",
      "membres_silencieux",
      "creer_rapport",
      "creer_planning",
      "creer_action",
      "cloturer_action",
      "creer_objectif",
      "aucun",
    ];

    // 1. Choisir l'outil et ses arguments
    const decisionRaw = await callAI({
      system: DECISION_SYSTEM,
      messages: [{ role: "user", content: data.message }],
      json: true,
      temperature: 0,
    });

    let tool: AssistantTool = "aucun";
    let args: any = {};
    try {
      const parsed = parseJsonLoose<any>(decisionRaw);
      const candidate = String(parsed?.tool ?? "aucun");
      if (ALLOWED.includes(candidate as AssistantTool)) tool = candidate as AssistantTool;
      args = parsed?.args ?? {};
    } catch {
      tool = "aucun";
    }

    // 2. Question générale : on délègue à l'assistante transversale existante
    if (tool === "aucun") {
      const { answerGlobally } = await import("@/lib/global-ai.server");
      const reply = await answerGlobally({ supabase, userId, message: data.message });
      return { answer: reply.trim(), tool, data: null };
    }

    // 3. Exécuter l'outil
    let result: any = null;
    try {
      result = await executeTool(tool, args, supabase, userId);
    } catch (e) {
      result = { erreur: e instanceof Error ? e.message : "Action impossible" };
    }

    // 4. Répondre avec le résultat réel
    const answerRaw = await callAI({
      system: ANSWER_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            demande: data.message,
            outil: tool,
            resultat: result,
          }).slice(0, 20000),
        },
      ],
      temperature: 0.3,
    });

    return { answer: answerRaw.trim(), tool, data: result };
  });
