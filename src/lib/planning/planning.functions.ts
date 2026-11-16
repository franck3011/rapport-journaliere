import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PlanStatus = "planned" | "in_progress" | "done" | "cancelled";
export type PlanPriority = "normal" | "high" | "urgent";

export type PlanItem = {
  id: string;
  title: string;
  details: string;
  planned_date: string;
  end_date: string | null;
  owner_id: string | null;
  owner_name: string;
  status: PlanStatus;
  priority: PlanPriority;
  created_by: string;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue AAAA-MM-JJ");

async function myCompanyId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.company_id ?? null;
}

export const listPlanItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        from: dateSchema,
        to: dateSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PlanItem[]> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) return [];

    // On récupère tout ce qui commence avant la fin de la période, puis on
    // filtre côté code sur la date de fin (les éléments sur plusieurs jours
    // doivent apparaître sur chacun des jours couverts).
    const { data: rows } = await supabase
      .from("plan_items")
      .select("*")
      .eq("company_id", companyId)
      .lte("planned_date", data.to)
      .order("planned_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500);

    const items = ((rows ?? []) as any[]).filter((row) => {
      const end = row.end_date ?? row.planned_date;
      return end >= data.from;
    });

    const ownerIds = Array.from(
      new Set(items.map((i) => i.owner_id).filter((id): id is string => !!id)),
    );
    const { data: profs } = ownerIds.length
      ? await supabase.from("profiles_public").select("id, full_name").in("id", ownerIds)
      : { data: [] as any[] };
    const nameOf = new Map<string, string>(
      ((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Utilisateur"]),
    );

    return items.map((row) => ({
      id: row.id,
      title: row.title,
      details: row.details ?? "",
      planned_date: row.planned_date,
      end_date: row.end_date,
      owner_id: row.owner_id,
      owner_name: row.owner_id ? nameOf.get(row.owner_id) ?? "Utilisateur" : "Non assigné",
      status: row.status as PlanStatus,
      priority: row.priority as PlanPriority,
      created_by: row.created_by,
    }));
  });

export const createPlanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string().trim().min(2, "Titre trop court").max(200),
        details: z.string().max(2000).default(""),
        plannedDate: dateSchema,
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        ownerId: z.string().uuid().nullable().default(null),
        priority: z.enum(["normal", "high", "urgent"]).default("normal"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    const { error } = await supabase.from("plan_items").insert({
      company_id: companyId,
      title: data.title,
      details: data.details,
      planned_date: data.plannedDate,
      end_date: data.endDate,
      owner_id: data.ownerId,
      priority: data.priority,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePlanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(2).max(200).optional(),
        details: z.string().max(2000).optional(),
        status: z.enum(["planned", "in_progress", "done", "cancelled"]).optional(),
        priority: z.enum(["normal", "high", "urgent"]).optional(),
        plannedDate: dateSchema.optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.details !== undefined) patch.details = data.details;
    if (data.status !== undefined) patch.status = data.status;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.plannedDate !== undefined) patch.planned_date = data.plannedDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase.from("plan_items").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("plan_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Transforme le planning d'une période en rapport : ce qui était prévu,
 * ce qui a été fait, ce qui ne l'a pas été. Le rapport est créé en brouillon,
 * l'auteur le relit et le complète avant de l'envoyer.
 */
export const createPlanReviewReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ from: dateSchema, to: dateSchema }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    const { data: rows } = await supabase
      .from("plan_items")
      .select("*")
      .eq("company_id", companyId)
      .lte("planned_date", data.to)
      .order("planned_date", { ascending: true })
      .limit(500);

    const items = ((rows ?? []) as any[]).filter((row) => {
      const end = row.end_date ?? row.planned_date;
      return end >= data.from;
    });

    if (items.length === 0) {
      throw new Error("Aucun travail planifié sur cette période : il n'y a rien à rapporter.");
    }

    const ownerIds = Array.from(
      new Set(items.map((i) => i.owner_id).filter((id): id is string => !!id)),
    );
    const { data: profs } = ownerIds.length
      ? await supabase.from("profiles_public").select("id, full_name").in("id", ownerIds)
      : { data: [] as any[] };
    const nameOf = new Map<string, string>(
      ((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Utilisateur"]),
    );

    const today = new Date().toISOString().slice(0, 10);
    const { summarizePlan, planLine } = await import("./summary");

    const list: PlanItem[] = items.map((row) => ({
      id: row.id,
      title: row.title,
      details: row.details ?? "",
      planned_date: row.planned_date,
      end_date: row.end_date,
      owner_id: row.owner_id,
      owner_name: row.owner_id ? nameOf.get(row.owner_id) ?? "Utilisateur" : "Non assigné",
      status: row.status,
      priority: row.priority,
      created_by: row.created_by,
    }));

    const summary = summarizePlan(list, today);
    const fr = (day: string) =>
      new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      });

    const sections = [
      {
        title: "Travaux réalisés",
        description: "",
        bullets: summary.doneItems.map(planLine),
      },
      {
        title: "Travaux non réalisés",
        description: "",
        bullets: summary.remaining.map((item) => {
          const end = item.end_date ?? item.planned_date;
          const suffix = end < today ? ` — en retard depuis le ${fr(end)}` : "";
          return `${planLine(item)}${suffix}`;
        }),
      },
      {
        title: "Travaux annulés",
        description: "",
        bullets: list.filter((i) => i.status === "cancelled").map(planLine),
      },
      {
        title: "Points à arbitrer",
        description: "Ce qui demande une décision ou un moyen supplémentaire.",
        bullets: summary.late
          .filter((i) => i.priority !== "normal")
          .map((i) => `${i.title} — ${i.owner_name} — priorité ${i.priority}`),
      },
    ].filter((section) => section.bullets.length > 0 || section.title === "Travaux non réalisés");

    const intro = `Bilan de la période du ${fr(data.from)} au ${fr(data.to)} : ${summary.done} travail(aux) réalisé(s) sur ${summary.total} planifié(s), soit ${summary.rate} % d'avancement.`;
    const conclusion =
      summary.late.length > 0
        ? `${summary.late.length} travail(aux) n'ont pas été réalisés dans les délais prévus.`
        : "Tous les travaux planifiés ont été menés dans les délais.";

    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        author_id: userId,
        report_date: today,
        title: `Bilan du planning — du ${fr(data.from)} au ${fr(data.to)}`,
        intro,
        conclusion,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: inserted, error: sectionError } = await supabase
      .from("report_sections")
      .insert(
        sections.map((section, index) => ({
          report_id: report.id,
          title: section.title,
          description: section.description,
          position: index,
        })),
      )
      .select("id");
    if (sectionError) throw new Error(sectionError.message);

    const bullets: any[] = [];
    sections.forEach((section, index) => {
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

    return { id: report.id };
  });

/* ------------------------- rédaction assistée par IA ------------------------- */

export type PlanNarrative = {
  title: string;
  intro: string;
  conclusion: string;
  sections: { title: string; description: string; bullets: string[] }[];
};

const NARRATIVE_SYSTEM = `Tu rédiges le bilan d'une période de planning pour un rapport professionnel.
Tu reçois des FAITS : des compteurs et la liste des travaux planifiés.
Tu ne peux RIEN inventer : aucun chiffre, aucun nom, aucun événement absent des faits.
Si une information manque, tu ne la supposes pas, tu l'ignores.

Structure attendue :
- une introduction de 2 à 3 phrases, commençant par les chiffres clés ;
- 3 ou 4 sections courtes, avec un titre explicite et des puces factuelles
  (une idée par puce, phrases courtes) ;
- une conclusion de 1 à 2 phrases.

Ton : professionnel, direct, sans emphase commerciale, sans adjectif inutile.
Français correct, pas de jargon.

Réponds UNIQUEMENT par un objet JSON valide :
{
  "title": "<titre du rapport>",
  "intro": "<paragraphe>",
  "sections": [{ "title": "<titre>", "description": "<une phrase ou vide>", "bullets": ["<puce>"] }],
  "conclusion": "<paragraphe>"
}`;

export const generatePlanNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ from: dateSchema, to: dateSchema }).parse(data))
  .handler(async ({ data, context }): Promise<PlanNarrative> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    const { data: rows } = await supabase
      .from("plan_items")
      .select("*")
      .eq("company_id", companyId)
      .lte("planned_date", data.to)
      .order("planned_date", { ascending: true })
      .limit(500);

    const items = ((rows ?? []) as any[]).filter((row) => {
      const end = row.end_date ?? row.planned_date;
      return end >= data.from;
    });
    if (items.length === 0) {
      throw new Error("Aucun travail planifié sur cette période : il n'y a rien à rapporter.");
    }

    const ownerIds = Array.from(
      new Set(items.map((i) => i.owner_id).filter((id): id is string => !!id)),
    );
    const { data: profs } = ownerIds.length
      ? await supabase.from("profiles_public").select("id, full_name").in("id", ownerIds)
      : { data: [] as any[] };
    const nameOf = new Map<string, string>(
      ((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Utilisateur"]),
    );

    const today = new Date().toISOString().slice(0, 10);
    const { summarizePlan } = await import("./summary");

    const list: PlanItem[] = items.map((row) => ({
      id: row.id,
      title: row.title,
      details: row.details ?? "",
      planned_date: row.planned_date,
      end_date: row.end_date,
      owner_id: row.owner_id,
      owner_name: row.owner_id ? nameOf.get(row.owner_id) ?? "Utilisateur" : "Non assigné",
      status: row.status,
      priority: row.priority,
      created_by: row.created_by,
    }));

    const summary = summarizePlan(list, today);
    const { callAI, parseJsonLoose } = await import("@/lib/ai-gateway.server");

    const facts = {
      periode: { du: data.from, au: data.to, aujourdhui: today },
      compteurs: {
        planifies: summary.total,
        realises: summary.done,
        en_cours: summary.inProgress,
        prevus: summary.planned,
        annules: summary.cancelled,
        en_retard: summary.late.length,
        taux_avancement_pourcent: summary.rate,
      },
      travaux: list.map((item) => ({
        titre: item.title,
        responsable: item.owner_name,
        du: item.planned_date,
        au: item.end_date ?? item.planned_date,
        statut: item.status,
        priorite: item.priority,
        details: item.details.slice(0, 300),
      })),
    };

    const raw = await callAI({
      system: NARRATIVE_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(facts).slice(0, 40000) }],
      json: true,
      temperature: 0.3,
    });

    const parsed = parseJsonLoose<any>(raw);
    const sections = Array.isArray(parsed?.sections)
      ? parsed.sections
          .slice(0, 6)
          .map((s: any) => ({
            title: String(s?.title ?? "Section"),
            description: String(s?.description ?? ""),
            bullets: (Array.isArray(s?.bullets) ? s.bullets : [])
              .map((b: any) => String(b ?? "").trim())
              .filter(Boolean)
              .slice(0, 20),
          }))
          .filter((s: any) => s.bullets.length > 0)
      : [];

    if (!parsed?.intro || sections.length === 0) {
      throw new Error("L'assistant n'a pas produit de bilan exploitable. Réessayez.");
    }

    return {
      title: String(parsed.title ?? "Bilan du planning"),
      intro: String(parsed.intro),
      conclusion: String(parsed.conclusion ?? ""),
      sections,
    };
  });

export const createPlanReportFromNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        narrative: z.object({
          title: z.string().min(1).max(300),
          intro: z.string().max(8000),
          conclusion: z.string().max(8000).default(""),
          sections: z
            .array(
              z.object({
                title: z.string().max(200),
                description: z.string().max(2000).default(""),
                bullets: z.array(z.string().max(3000)).max(30),
              }),
            )
            .min(1)
            .max(8),
        }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const today = new Date().toISOString().slice(0, 10);
    const doc = data.narrative;

    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        author_id: userId,
        report_date: today,
        title: doc.title,
        intro: doc.intro,
        conclusion: doc.conclusion,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: inserted, error: sectionError } = await supabase
      .from("report_sections")
      .insert(
        doc.sections.map((section, index) => ({
          report_id: report.id,
          title: section.title,
          description: section.description,
          position: index,
        })),
      )
      .select("id");
    if (sectionError) throw new Error(sectionError.message);

    const bullets: any[] = [];
    doc.sections.forEach((section, index) => {
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

    return { id: report.id };
  });
