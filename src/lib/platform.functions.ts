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

function hasAal2(claims: any): boolean {
  return claims?.aal === "aal2";
}

async function assertPlatformAdmin(_supabase: any, userId: string, claims?: any) {
  if (!(await isPlatformAdmin(userId))) throw new Error("Réservé aux super admins");
  if (claims !== undefined && !hasAal2(claims)) {
    throw new Error("2FA requise (super admin doit valider un code TOTP)");
  }
}

export const checkIsPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    return isPlatformAdmin(context.userId);
  });

export type AdminAccessStatus = {
  isAdmin: boolean;
  aal: string | null;
  mfaVerified: boolean;
};

export const getAdminAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAccessStatus> => {
    const isAdmin = await isPlatformAdmin(context.userId);
    const aal = (context.claims as any)?.aal ?? null;
    return { isAdmin, aal, mfaVerified: aal === "aal2" };
  });


export type AdminCompanyRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  owner_name: string;
  seat_limit: number;
  members_count: number;
  created_at: string;
};

export const listCompaniesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCompanyRow[]> => {
    await assertPlatformAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("id, name, owner_id, seat_limit, created_at")
      .order("created_at", { ascending: false });
    if (!companies || companies.length === 0) return [];
    const ownerIds = companies.map((c: any) => c.owner_id);
    const [{ data: profs }, { data: counts }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ownerIds),
      supabaseAdmin
        .from("company_members")
        .select("company_id")
        .in("company_id", companies.map((c: any) => c.id)),
    ]);
    const profMap = Object.fromEntries(
      (profs ?? []).map((p: any) => [p.id, p]),
    );
    const countMap: Record<string, number> = {};
    (counts ?? []).forEach((r: any) => {
      countMap[r.company_id] = (countMap[r.company_id] ?? 0) + 1;
    });
    return companies.map((c: any) => ({
      id: c.id,
      name: c.name,
      owner_id: c.owner_id,
      owner_email: profMap[c.owner_id]?.email ?? "",
      owner_name: profMap[c.owner_id]?.full_name ?? "",
      seat_limit: c.seat_limit,
      members_count: countMap[c.id] ?? 0,
      created_at: c.created_at,
    }));
  });

export const updateSeatLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; seatLimit: number }) =>
    z
      .object({
        companyId: z.string().uuid(),
        seatLimit: z.number().int().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ seat_limit: data.seatLimit })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PlatformAdminRow = {
  user_id: string;
  email: string;
  full_name: string;
  created_at: string;
};

export const listPlatformAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformAdminRow[]> => {
    await assertPlatformAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id, created_at")
      .order("created_at", { ascending: true });
    if (!rows || rows.length === 0) return [];
    const ids = rows.map((r: any) => r.user_id);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    const profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    return rows.map((r: any) => ({
      user_id: r.user_id,
      email: profMap[r.user_id]?.email ?? "",
      full_name: profMap[r.user_id]?.full_name ?? "",
      created_at: r.created_at,
    }));
  });

export const addPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) =>
    z.object({ email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!prof) throw new Error("Aucun utilisateur avec cet email");
    const { error } = await supabaseAdmin
      .from("platform_admins")
      .insert({ user_id: prof.id });
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const removePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId, context.claims);
    if (data.userId === context.userId)
      throw new Error("Vous ne pouvez pas vous retirer vous-même");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true });
    if ((count ?? 0) <= 1) throw new Error("Impossible de retirer le dernier super admin");
    const { error } = await supabaseAdmin
      .from("platform_admins")
      .delete()
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Récupération d'urgence 2FA : désenrôle les facteurs TOTP du super admin connecté.
 *
 * Sans garde-fou, cette fonction annulait la 2FA : un mot de passe volé suffisait
 * à ouvrir une session aal1, à supprimer les facteurs, puis à en enrôler un nouveau
 * pour atteindre aal2. Trois conditions sont désormais exigées :
 *   1. le compte doit être platform_admin ;
 *   2. l'authentification doit dater de moins de 15 minutes (amr / iat du JWT) ;
 *   3. l'appelant doit retaper l'adresse e-mail du compte (confirmation explicite).
 * Chaque réinitialisation est journalisée dans admin_audit_log.
 */
const MFA_RESET_MAX_AGE_SECONDS = 15 * 60;

function lastAuthTimestamp(claims: unknown): number {
  const c = (claims ?? {}) as { amr?: Array<{ timestamp?: number }>; iat?: number };
  const fromAmr = Number(c.amr?.[0]?.timestamp ?? 0);
  if (Number.isFinite(fromAmr) && fromAmr > 0) return fromAmr;
  const fromIat = Number(c.iat ?? 0);
  return Number.isFinite(fromIat) ? fromIat : 0;
}

export const emergencyResetMyMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ confirmEmail: z.string().email("Adresse e-mail invalide") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isPlatformAdmin(context.userId))) {
      throw new Error("Réinitialisation 2FA réservée aux super admins de la plateforme.");
    }

    const authAge = Math.floor(Date.now() / 1000) - lastAuthTimestamp(context.claims);
    if (!Number.isFinite(authAge) || authAge > MFA_RESET_MAX_AGE_SECONDS) {
      throw new Error(
        "Session trop ancienne : reconnectez-vous, puis relancez la réinitialisation dans les 15 minutes.",
      );
    }

    const accountEmail = String((context.claims as any)?.email ?? "")
      .trim()
      .toLowerCase();
    if (!accountEmail || data.confirmEmail.trim().toLowerCase() !== accountEmail) {
      throw new Error("L'adresse e-mail saisie ne correspond pas au compte connecté.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: factorsRes, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: context.userId,
    });
    if (error) throw new Error(error.message);
    const factors = factorsRes?.factors ?? [];
    for (const f of factors) {
      const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        userId: context.userId,
        id: f.id,
      });
      if (delErr) throw new Error(delErr.message);
    }

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "mfa.emergency_reset",
      entity_type: "user",
      entity_id: context.userId,
      metadata: { factors_removed: factors.length },
    });

    return { ok: true, factorsRemoved: factors.length };
  });
