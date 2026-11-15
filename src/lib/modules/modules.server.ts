import type { SupabaseClient } from "@supabase/supabase-js";
import { OPTIONAL_MODULE_CODES, getModule } from "./registry";

export type ModuleState = {
  companyId: string | null;
  isOwner: boolean;
  /** codes des modules désactivés pour l'entreprise */
  disabled: string[];
  /**
   * Rang du plan de l'entreprise (colonne `sort_order` du plan).
   * `null` = aucun plan souscrit : aucune restriction n'est appliquée, pour ne
   * jamais bloquer une entreprise existante qui n'a pas encore choisi de palier.
   */
  planRank: number | null;
};

export async function loadModuleState(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<ModuleState> {
  const { data: mem } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem?.company_id)
    return { companyId: null, isOwner: false, disabled: [], planRank: null };

  const [{ data: company }, { data: rows }] = await Promise.all([
    supabase
      .from("companies")
      .select("owner_id, plan_id")
      .eq("id", mem.company_id)
      .maybeSingle(),
    supabase
      .from("company_modules")
      .select("module_code, enabled")
      .eq("company_id", mem.company_id),
  ]);

  const disabled = (rows ?? [])
    .filter((r: any) => r.enabled === false)
    .map((r: any) => r.module_code as string)
    .filter((code: string) => OPTIONAL_MODULE_CODES.includes(code));

  let planRank: number | null = null;
  const planId = (company as any)?.plan_id as string | null | undefined;
  if (planId) {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("sort_order")
      .eq("id", planId)
      .maybeSingle();
    planRank = ((plan as any)?.sort_order as number) ?? null;
  }

  return {
    companyId: mem.company_id as string,
    isOwner: (company as any)?.owner_id === userId,
    disabled,
    planRank,
  };
}

/** Vérifie qu'un module est autorisé : activé pour l'entreprise et inclus dans son plan. */
export async function assertModuleEnabled(
  supabase: SupabaseClient<any>,
  userId: string,
  code: string,
): Promise<string> {
  const state = await loadModuleState(supabase, userId);
  if (!state.companyId) throw new Error("Vous devez appartenir à une entreprise");
  if (state.disabled.includes(code))
    throw new Error("Cette application est désactivée pour votre entreprise");

  const required = getModule(code)?.minPlanRank;
  if (required && state.planRank !== null && state.planRank < required) {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("name")
      .eq("sort_order", required)
      .maybeSingle();
    const name = (plan as any)?.name as string | undefined;
    throw new Error(
      name
        ? `Cette application est incluse à partir du plan ${name}.`
        : "Cette application n'est pas incluse dans votre plan actuel.",
    );
  }

  return state.companyId;
}
