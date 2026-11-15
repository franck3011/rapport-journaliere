import type { SupabaseClient } from "@supabase/supabase-js";
import { OPTIONAL_MODULE_CODES } from "./registry";
import { featureForModule, featureLabel, type FeatureCode } from "@/lib/plans/features";

export type ModuleState = {
  companyId: string | null;
  isOwner: boolean;
  /** codes des modules désactivés pour l'entreprise */
  disabled: string[];
  /**
   * Codes des fonctionnalités incluses dans le plan de l'entreprise.
   * `null` = aucun plan souscrit : aucune restriction n'est appliquée, pour ne
   * jamais bloquer une entreprise existante qui n'a pas encore choisi de palier.
   */
  features: string[] | null;
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
    return { companyId: null, isOwner: false, disabled: [], features: null };

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

  let features: string[] | null = null;
  const planId = (company as any)?.plan_id as string | null | undefined;
  if (planId) {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("features")
      .eq("id", planId)
      .maybeSingle();
    const raw = (plan as any)?.features;
    features = Array.isArray(raw) ? (raw as string[]) : [];
  }

  return {
    companyId: mem.company_id as string,
    isOwner: (company as any)?.owner_id === userId,
    disabled,
    features,
  };
}

/** Vrai si le plan de l'entreprise inclut la fonctionnalité (ou si aucun plan n'est défini). */
export function hasFeature(state: ModuleState, code: FeatureCode): boolean {
  if (state.features === null) return true;
  return state.features.includes(code);
}

/**
 * Vérifie qu'un module est autorisé : activé pour l'entreprise et inclus dans son plan.
 */
export async function assertModuleEnabled(
  supabase: SupabaseClient<any>,
  userId: string,
  code: string,
): Promise<string> {
  const state = await loadModuleState(supabase, userId);
  if (!state.companyId) throw new Error("Vous devez appartenir à une entreprise");
  if (state.disabled.includes(code))
    throw new Error("Cette application est désactivée pour votre entreprise");

  const required = featureForModule(code);
  if (required && !hasFeature(state, required)) {
    throw new Error(
      `« ${featureLabel(required)} » n'est pas incluse dans votre plan. Changez de formule depuis la page Abonnement.`,
    );
  }

  return state.companyId;
}

/** Vérifie qu'une fonctionnalité est incluse dans le plan. */
export async function assertFeature(
  supabase: SupabaseClient<any>,
  userId: string,
  code: FeatureCode,
): Promise<void> {
  const state = await loadModuleState(supabase, userId);
  if (!hasFeature(state, code)) {
    throw new Error(
      `« ${featureLabel(code)} » n'est pas incluse dans votre plan actuel.`,
    );
  }
}
