import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SubscriptionState = {
  companyId: string | null;
  /** trial = essai en cours, active = abonnement, expired = essai terminé sans plan */
  status: "none" | "trial" | "active" | "expired";
  daysLeft: number;
  planName: string | null;
  isOwner: boolean;
};

const TRIAL_DAYS = 14;

/**
 * État d'abonnement de l'entreprise.
 *
 * Aucune migration nécessaire : l'essai se calcule à partir de la date de
 * création de l'entreprise, et l'abonnement se lit sur `plan_id`.
 */
export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionState> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!mem?.company_id) {
      return { companyId: null, status: "none", daysLeft: 0, planName: null, isOwner: false };
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id, owner_id, plan_id, subscription_status, created_at, current_plan:subscription_plans!companies_plan_id_fkey(name)")
      .eq("id", mem.company_id)
      .maybeSingle();

    if (!company) {
      return { companyId: null, status: "none", daysLeft: 0, planName: null, isOwner: false };
    }

    const planName = (company as any)?.current_plan?.name ?? null;
    const isOwner = company.owner_id === userId;

    if (company.plan_id) {
      return {
        companyId: company.id,
        status: "active",
        daysLeft: 0,
        planName,
        isOwner,
      };
    }

    const created = company.created_at ? new Date(company.created_at).getTime() : Date.now();
    const elapsedDays = Math.floor((Date.now() - created) / 86400000);
    const daysLeft = TRIAL_DAYS - elapsedDays;

    return {
      companyId: company.id,
      status: daysLeft > 0 ? "trial" : "expired",
      daysLeft: Math.max(0, daysLeft),
      planName,
      isOwner,
    };
  });
