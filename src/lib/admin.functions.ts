import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function assertAdmin(userId: string, claims?: any) {
  if (!(await isPlatformAdmin(userId))) throw new Error("Réservé aux super admins");
  if (claims !== undefined && claims?.aal !== "aal2") {
    throw new Error("2FA requise (super admin doit valider un code TOTP)");
  }
}

async function logAction(
  actorId: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, any> = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", actorId)
    .maybeSingle();
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: actorId,
    actor_email: prof?.email ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

// ----------- Dashboard -----------
export type AdminDashboard = {
  companiesCount: number;
  usersCount: number;
  reportsThisMonth: number;
  revenueMtdCents: number;
  activePlans: number;
};

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboard> => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [companies, users, reports, revenue, plans] = await Promise.all([
      supabaseAdmin.from("companies").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
      supabaseAdmin.from("company_invoices").select("amount_cents").eq("status", "paid").gte("paid_at", monthStart),
      supabaseAdmin.from("subscription_plans").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);

    const revenueMtdCents = (revenue.data ?? []).reduce((s: number, r: any) => s + (r.amount_cents ?? 0), 0);
    return {
      companiesCount: companies.count ?? 0,
      usersCount: users.count ?? 0,
      reportsThisMonth: reports.count ?? 0,
      revenueMtdCents,
      activePlans: plans.count ?? 0,
    };
  });

// ----------- Plans -----------
export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  yearly_price_cents: number;
  seat_limit: number;
  price_per_extra_seat_cents: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
};

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Plan[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isAdmin = await isPlatformAdmin(context.userId);
    let q = supabaseAdmin.from("subscription_plans").select("*").order("sort_order");
    if (!isAdmin) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] }));
  });

const planSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  monthly_price_cents: z.number().int().min(0),
  yearly_price_cents: z.number().int().min(0),
  seat_limit: z.number().int().min(1),
  price_per_extra_seat_cents: z.number().int().min(0),
  features: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = { ...data };
    if (data.id) {
      const { error } = await supabaseAdmin.from("subscription_plans").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logAction(context.userId, "plan.update", "plan", data.id, { code: data.code });
    } else {
      delete payload.id;
      const { data: row, error } = await supabaseAdmin.from("subscription_plans").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      await logAction(context.userId, "plan.create", "plan", row.id, { code: data.code });
    }
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscription_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "plan.delete", "plan", data.id);
    return { ok: true };
  });

export const assignCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; planId: string | null; billingCycle: "monthly" | "yearly"; customSeatPriceCents?: number | null }) =>
    z
      .object({
        companyId: z.string().uuid(),
        planId: z.string().uuid().nullable(),
        billingCycle: z.enum(["monthly", "yearly"]),
        customSeatPriceCents: z.number().int().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {
      plan_id: data.planId,
      billing_cycle: data.billingCycle,
      custom_seat_price_cents: data.customSeatPriceCents ?? null,
    };
    if (data.planId) {
      const { data: p } = await supabaseAdmin
        .from("subscription_plans")
        .select("seat_limit")
        .eq("id", data.planId)
        .maybeSingle();
      if (p) patch.seat_limit = p.seat_limit;
    }
    const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", data.companyId);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "company.plan.assign", "company", data.companyId, patch);
    return { ok: true };
  });

// ----------- Invoices -----------
export type Invoice = {
  id: string;
  company_id: string;
  company_name: string;
  number: string;
  amount_cents: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; companyId?: string } | undefined) =>
    z.object({ status: z.string().optional(), companyId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<Invoice[]> => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("company_invoices")
      .select("*, companies(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      company_id: r.company_id,
      company_name: r.companies?.name ?? "—",
      number: r.number,
      amount_cents: r.amount_cents,
      currency: r.currency,
      period_start: r.period_start,
      period_end: r.period_end,
      status: r.status,
      due_date: r.due_date,
      paid_at: r.paid_at,
      notes: r.notes,
      created_at: r.created_at,
    }));
  });

async function nextInvoiceNumber(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const { data } = await supabaseAdmin
    .from("company_invoices")
    .select("number")
    .like("number", `${prefix}%`)
    .order("number", { ascending: false })
    .limit(1);
  const last = data?.[0]?.number as string | undefined;
  const n = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    companyId: string;
    amountCents: number;
    periodStart?: string | null;
    periodEnd?: string | null;
    dueDate?: string | null;
    notes?: string | null;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        amountCents: z.number().int().min(0),
        periodStart: z.string().optional().nullable(),
        periodEnd: z.string().optional().nullable(),
        dueDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const number = await nextInvoiceNumber();
    const { data: row, error } = await supabaseAdmin
      .from("company_invoices")
      .insert({
        company_id: data.companyId,
        amount_cents: data.amountCents,
        number,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        due_date: data.dueDate || null,
        notes: data.notes || null,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAction(context.userId, "invoice.create", "invoice", row.id, { number, amount: data.amountCents });
    return { ok: true, id: row.id, number };
  });

export const updateInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "draft" | "sent" | "paid" | "void" | "overdue" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "sent", "paid", "void", "overdue"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { status: data.status };
    if (data.status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("company_invoices").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Paiement encaissé : on applique le plan que l'entreprise avait demandé.
    if (data.status === "paid") {
      const { data: invoice } = await supabaseAdmin
        .from("company_invoices")
        .select("company_id")
        .eq("id", data.id)
        .maybeSingle();

      if (invoice?.company_id) {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("pending_plan_id, pending_billing_cycle")
          .eq("id", invoice.company_id)
          .maybeSingle();

        if (company?.pending_plan_id) {
          await supabaseAdmin
            .from("companies")
            .update({
              plan_id: company.pending_plan_id,
              billing_cycle: company.pending_billing_cycle ?? "monthly",
              subscription_status: "active",
              pending_plan_id: null,
              pending_billing_cycle: null,
            })
            .eq("id", invoice.company_id);
        }
      }
    }

    await logAction(context.userId, `invoice.${data.status}`, "invoice", data.id);
    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("company_invoices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "invoice.delete", "invoice", data.id);
    return { ok: true };
  });

// ----------- Users -----------
export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  reports_count: number;
  company_name: string | null;
  is_admin: boolean;
  is_banned: boolean;
  banned_reason: string | null;
};

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at, is_banned, banned_reason")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    if (!profs || profs.length === 0) return [];
    const ids = profs.map((p: any) => p.id);
    const [reports, members, admins] = await Promise.all([
      supabaseAdmin.from("reports").select("author_id").in("author_id", ids),
      supabaseAdmin.from("company_members").select("user_id, companies(name)").in("user_id", ids),
      supabaseAdmin.from("platform_admins").select("user_id").in("user_id", ids),
    ]);
    const reportsCount: Record<string, number> = {};
    (reports.data ?? []).forEach((r: any) => {
      reportsCount[r.author_id] = (reportsCount[r.author_id] ?? 0) + 1;
    });
    const companyMap: Record<string, string> = {};
    (members.data ?? []).forEach((m: any) => {
      if (m.companies?.name) companyMap[m.user_id] = m.companies.name;
    });
    const adminSet = new Set((admins.data ?? []).map((a: any) => a.user_id));
    return profs.map((p: any) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name ?? "",
      created_at: p.created_at,
      reports_count: reportsCount[p.id] ?? 0,
      company_name: companyMap[p.id] ?? null,
      is_admin: adminSet.has(p.id),
      is_banned: !!p.is_banned,
      banned_reason: p.banned_reason ?? null,
    }));
  });

export const banUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; reason?: string }) =>
    z.object({ userId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    if (data.userId === context.userId) throw new Error("Vous ne pouvez pas vous bannir vous-même");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (isAdmin) throw new Error("Impossible de bannir un super admin");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_reason: data.reason ?? null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    try {
      await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    } catch {}
    await logAction(context.userId, "user.ban", "user", data.userId, { reason: data.reason });
    return { ok: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_banned: false, banned_at: null, banned_reason: null })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "user.unban", "user", data.userId);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    if (data.userId === context.userId) throw new Error("Vous ne pouvez pas supprimer votre propre compte");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (isAdmin) throw new Error("Impossible de supprimer un super admin. Retirez-le d'abord des super admins.");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "user.delete", "user", data.userId, { email: prof?.email });
    return { ok: true };
  });

// ----------- Audit log -----------
export type AuditRow = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  created_at: string;
};

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q?: string; action?: string } | undefined) =>
    z.object({ q: z.string().optional(), action: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<AuditRow[]> => {
    await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_email, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.action) q = q.eq("action", data.action);
    if (data.q && data.q.trim()) {
      const like = `%${data.q.trim().replace(/[^\p{L}\p{N}\s@_\-]/gu, " ").slice(0, 100)}%`;
      q = q.or(`actor_email.ilike.${like},entity_id.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AuditRow[];
  });

/* ------------------------------------------------------------------ */
/* Abonnements : demandes en attente et activation directe            */
/* ------------------------------------------------------------------ */

export const listPendingPlanRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any): Promise<any[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isPlatformAdmin(context.userId))) {
      throw new Error("Accès réservé aux administrateurs de la plateforme.");
    }
    const admin: any = supabaseAdmin;

    // Pas de jointure nommée : le nom de la contrainte peut varier selon la base,
    // et une jointure cassée ferait échouer toute la liste.
    const { data, error } = await admin
      .from("companies")
      .select("id, name, pending_plan_id, pending_billing_cycle, plan_id, subscription_status")
      .not("pending_plan_id", "is", null)
      .order("name");
    if (error) throw new Error(error.message);

    const planIds = Array.from(
      new Set((data ?? []).map((row: any) => row.pending_plan_id).filter(Boolean)),
    );
    const { data: plans } = planIds.length
      ? await admin
          .from("subscription_plans")
          .select("id, name, price_monthly, price_yearly")
          .in("id", planIds)
      : { data: [] as any[] };

    const byId = new Map<string, any>(((plans ?? []) as any[]).map((p) => [p.id, p]));

    return (data ?? []).map((row: any) => {
      const plan = byId.get(row.pending_plan_id);
      return {
        id: row.id,
        name: row.name,
        planId: row.pending_plan_id,
        planName: plan?.name ?? "Formule",
        cycle: row.pending_billing_cycle ?? "monthly",
        price: plan?.price_monthly ?? plan?.price_yearly ?? null,
        currentPlanId: row.plan_id,
        status: row.subscription_status,
      };
    });
  });

/**
 * Active le plan déjà demandé par l'entreprise, sans passer par une facture.
 * Utile quand le paiement a été encaissé hors application (Mobile Money).
 */
export const activatePendingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }: any): Promise<{ ok: true; planName: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isPlatformAdmin(context.userId))) {
      throw new Error("Accès réservé aux administrateurs de la plateforme.");
    }
    const admin: any = supabaseAdmin;

    const { data: company } = await admin
      .from("companies")
      .select("pending_plan_id, pending_billing_cycle")
      .eq("id", data.companyId)
      .maybeSingle();

    if (!company?.pending_plan_id) {
      throw new Error("Aucune formule en attente pour cette entreprise.");
    }

    const { error } = await admin
      .from("companies")
      .update({
        plan_id: company.pending_plan_id,
        billing_cycle: company.pending_billing_cycle ?? "monthly",
        subscription_status: "active",
        pending_plan_id: null,
        pending_billing_cycle: null,
      })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);

    const { data: plan } = await admin
      .from("subscription_plans")
      .select("name")
      .eq("id", company.pending_plan_id)
      .maybeSingle();

    return { ok: true, planName: plan?.name ?? "Formule" };
  });