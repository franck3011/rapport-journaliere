import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PlanSection = {
  title: string;
  description: string;
  bullets: string[];
};

export type PlanDocument = {
  id: string;
  title: string;
  intro: string;
  conclusion: string;
  sections: PlanSection[];
  period_start: string;
  period_end: string;
  status: "draft" | "final";
  created_by: string;
  updated_at: string;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue AAAA-MM-JJ");

const sectionSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(2000).default(""),
  bullets: z.array(z.string().max(3000)).max(40).default([]),
});

const documentSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Le titre est obligatoire").max(300),
  intro: z.string().max(8000).default(""),
  conclusion: z.string().max(8000).default(""),
  sections: z.array(sectionSchema).max(12).default([]),
  periodStart: dateSchema,
  periodEnd: dateSchema,
});

async function myCompanyId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.company_id ?? null;
}

function toDocument(row: any): PlanDocument {
  const sections: PlanSection[] = Array.isArray(row.sections)
    ? row.sections.map((section: any) => ({
        title: String(section?.title ?? ""),
        description: String(section?.description ?? ""),
        bullets: (Array.isArray(section?.bullets) ? section.bullets : []).map((b: any) => String(b)),
      }))
    : [];

  return {
    id: row.id,
    title: row.title,
    intro: row.intro ?? "",
    conclusion: row.conclusion ?? "",
    sections,
    period_start: row.period_start,
    period_end: row.period_end,
    status: (row.status === "final" ? "final" : "draft") as "draft" | "final",
    created_by: row.created_by,
    updated_at: row.updated_at,
  };
}

export const listPlanDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanDocument[]> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) return [];

    const { data } = await supabase
      .from("plan_documents")
      .select("*")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false })
      .limit(100);

    return ((data ?? []) as any[]).map(toDocument);
  });

export const getPlanDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PlanDocument | null> => {
    const supabase: any = context.supabase;
    const { data: row } = await supabase
      .from("plan_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    return row ? toDocument(row) : null;
  });

export const savePlanDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    const payload = {
      title: data.title,
      intro: data.intro,
      conclusion: data.conclusion,
      sections: data.sections,
      period_start: data.periodStart,
      period_end: data.periodEnd,
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("plan_documents")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error("Document introuvable ou non autorisé.");
      return { id: updated.id };
    }

    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    const { data: inserted, error } = await supabase
      .from("plan_documents")
      .insert({ ...payload, company_id: companyId, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deletePlanDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("plan_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- partage --------------------------------- */

export type PlanShare = {
  id: string;
  token: string;
  expires_at: string | null;
  created_at: string;
};

export const listPlanShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ planId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PlanShare[]> => {
    const supabase: any = context.supabase;
    const { data: rows } = await supabase
      .from("plan_shares")
      .select("id, token, expires_at, created_at")
      .eq("plan_id", data.planId)
      .order("created_at", { ascending: false });
    return (rows ?? []) as PlanShare[];
  });

export const createPlanShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ planId: z.string().uuid(), days: z.number().int().min(1).max(90).default(30) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<PlanShare> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const expiresAt = new Date(Date.now() + data.days * 86400000).toISOString();

    const { data: row, error } = await supabase
      .from("plan_shares")
      .insert({
        plan_id: data.planId,
        expires_at: expiresAt,
        created_by: userId,
      })
      .select("id, token, expires_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as PlanShare;
  });

export const revokePlanShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("plan_shares").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SharedPlan = {
  title: string;
  intro: string;
  conclusion: string;
  sections: PlanSection[];
  period_start: string;
  period_end: string;
  company_name: string;
};

/** Accès public en lecture seule via un jeton — aucune authentification. */
export const getSharedPlan = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<SharedPlan | null> => {
    const { supabaseAdmin: adminRaw } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = adminRaw;

    const { data: share } = await supabaseAdmin
      .from("plan_shares")
      .select("id, plan_id, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!share) return null;
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return null;

    const { data: plan } = await supabaseAdmin
      .from("plan_documents")
      .select("*")
      .eq("id", share.plan_id)
      .maybeSingle();
    if (!plan) return null;

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", plan.company_id)
      .maybeSingle();

    const doc = toDocument(plan);
    return {
      title: doc.title,
      intro: doc.intro,
      conclusion: doc.conclusion,
      sections: doc.sections,
      period_start: doc.period_start,
      period_end: doc.period_end,
      company_name: (company as any)?.name ?? "DailyBrief",
    };
  });
