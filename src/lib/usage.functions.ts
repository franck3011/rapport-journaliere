import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Métriques d'usage réservées aux administrateurs de la plateforme.
 * Lecture seule, via le client service role.
 */
export type UsageMetrics = {
  companies: number;
  users: number;
  reports7d: number;
  reportsTotal: number;
  plans: { name: string; count: number }[];
  trialsEnding: number;
  errors24h: number;
};

async function assertAdmin(userId: string): Promise<void> {
  const { supabaseAdmin: raw } = await import("@/integrations/supabase/client.server");
  const admin: any = raw;
  const { data } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Accès réservé aux administrateurs de la plateforme.");
}

export const getUsageMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageMetrics> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin: raw } = await import("@/integrations/supabase/client.server");
    const admin: any = raw;

    const count = async (query: any): Promise<number> => {
      const { count: value } = await query;
      return value ?? 0;
    };

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();

    const [companies, users, reports7d, reportsTotal, errors24h] = await Promise.all([
      count(admin.from("companies").select("id", { count: "exact", head: true })),
      count(admin.from("company_members").select("user_id", { count: "exact", head: true })),
      count(
        admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
      ),
      count(admin.from("reports").select("id", { count: "exact", head: true })),
      count(
        admin
          .from("error_events")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayAgo),
      ),
    ]);

    const { data: companiesRows } = await admin
      .from("companies")
      .select("plan_id, created_at, subscription_plans:subscription_plans!companies_plan_id_fkey(name)");

    const planCounts = new Map<string, number>();
    let trialsEnding = 0;

    for (const row of (companiesRows ?? []) as any[]) {
      const name = row.subscription_plans?.name ?? "Sans plan";
      planCounts.set(name, (planCounts.get(name) ?? 0) + 1);

      if (!row.plan_id && row.created_at) {
        const elapsed = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000);
        const left = 14 - elapsed;
        if (left > 0 && left <= 5) trialsEnding++;
      }
    }

    return {
      companies,
      users,
      reports7d,
      reportsTotal,
      plans: Array.from(planCounts.entries())
        .map(([name, value]) => ({ name, count: value }))
        .sort((a, b) => b.count - a.count),
      trialsEnding,
      errors24h,
    };
  });
