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
