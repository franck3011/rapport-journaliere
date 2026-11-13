import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ObjectiveKind = "reports" | "manual";

export type ObjectiveRow = {
  id: string;
  title: string;
  kind: ObjectiveKind;
  owner_id: string | null;
  owner_name: string;
  target_value: number;
  actual_value: number;
  unit: string;
  period_start: string;
  period_end: string;
  progress: number; // 0..1+
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

export const listObjectives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ObjectiveRow[]> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) return [];

    const { data: rows } = await supabase
      .from("objectives")
      .select("*")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    const list = (rows ?? []) as any[];
    if (list.length === 0) return [];

    // Réalisé des objectifs de type « rapports » : comptage sur la période.
    const reportObjectives = list.filter((o) => o.kind === "reports");
    const actuals = new Map<string, number>();
    await Promise.all(
      reportObjectives.map(async (o) => {
        let q = supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .gte("report_date", o.period_start)
          .lte("report_date", o.period_end);
        if (o.owner_id) q = q.eq("author_id", o.owner_id);
        const { count } = await q;
        actuals.set(o.id, count ?? 0);
      }),
    );

    const ownerIds = Array.from(
      new Set(list.map((o) => o.owner_id).filter((x): x is string => !!x)),
    );
    const { data: profs } = ownerIds.length
      ? await supabase.from("profiles_public").select("id, full_name").in("id", ownerIds)
      : { data: [] as any[] };
    const nameOf = new Map<string, string>(
      ((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Utilisateur"]),
    );

    return list.map((o) => {
      const actual =
        o.kind === "reports" ? actuals.get(o.id) ?? 0 : Number(o.current_value ?? 0);
      const target = Number(o.target_value ?? 0);
      return {
        id: o.id,
        title: o.title,
        kind: o.kind as ObjectiveKind,
        owner_id: o.owner_id,
        owner_name: o.owner_id ? nameOf.get(o.owner_id) ?? "Utilisateur" : "Toute l'entreprise",
        target_value: target,
        actual_value: actual,
        unit: o.unit ?? "",
        period_start: o.period_start,
        period_end: o.period_end,
        progress: target > 0 ? actual / target : 0,
      };
    });
  });

export const createObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(3, "Titre trop court").max(160),
        kind: z.enum(["reports", "manual"]).default("manual"),
        ownerId: z.string().uuid().nullable().default(null),
        targetValue: z.number().nonnegative(),
        currentValue: z.number().nonnegative().default(0),
        unit: z.string().max(20).default(""),
        periodStart: dateSchema,
        periodEnd: dateSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    const { error } = await supabase.from("objectives").insert({
      company_id: companyId,
      owner_id: data.ownerId,
      title: data.title,
      kind: data.kind,
      target_value: data.targetValue,
      current_value: data.kind === "manual" ? data.currentValue : 0,
      unit: data.unit,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(3).max(160).optional(),
        targetValue: z.number().nonnegative().optional(),
        currentValue: z.number().nonnegative().optional(),
        unit: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.targetValue !== undefined) patch.target_value = data.targetValue;
    if (data.currentValue !== undefined) patch.current_value = data.currentValue;
    if (data.unit !== undefined) patch.unit = data.unit;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase.from("objectives").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("objectives").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
