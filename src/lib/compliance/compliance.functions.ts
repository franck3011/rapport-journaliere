import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCompliance } from "./compliance.server";

// Les types restent côté serveur : les réimporter ici casse l'inférence du
// server function (le module .server est retiré du bundle client).
type ComplianceSettings = any;

/**
 * Recalcul du score de conformité.
 *
 * Contrat (exigences de sécurité) :
 *  1. l'appelant est identifié avec SA session — jamais avec la clé de service ;
 *  2. il doit être gestionnaire de son entreprise, vérifié AVANT tout calcul ;
 *  3. aucun paramètre client : ni score, ni période — la période est calculée
 *     ici, côté serveur ;
 *  4. la clé de service ne sert qu'à l'insertion finale ;
 *  5. un recalcul est refusé si un score existe déjà pour la même période
 *     depuis moins de 60 minutes (anti-accumulation).
 */

const COOLDOWN_MINUTES = 60;
const PERIOD_DAYS = 30;

/** Période calculée côté serveur : les 30 derniers jours, aujourd'hui inclus. */
function currentPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - (PERIOD_DAYS - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export const recalculateComplianceScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // Aucun paramètre client : ni score, ni période.
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }: any): Promise<any> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    // 1. Entreprise de l'appelant (session utilisateur, RLS appliquée).
    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId: string | undefined = mem?.company_id;
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    // 2. Droit de recalcul : propriétaire, ou rôle d'encadrement.
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", companyId)
      .maybeSingle();
    const isManager =
      company?.owner_id === userId ||
      ["owner", "admin"].includes(String(mem?.role ?? ""));
    if (!isManager) {
      throw new Error("Seul un gestionnaire peut recalculer le score.");
    }

    // 3. Réglages de l'entreprise.
    const { data: settingsRow } = await supabase
      .from("compliance_settings")
      .select("*")
      .eq("entity_id", companyId)
      .maybeSingle();
    if (!settingsRow) throw new Error("Réglages du score introuvables.");
    const settings = settingsRow as ComplianceSettings;

    // 4. Période serveur + anti-doublon.
    const { start, end } = currentPeriod();

    const { data: existing } = await supabase
      .from("compliance_scores")
      .select("calculated_at")
      .eq("entity_id", companyId)
      .eq("period_start", start)
      .eq("period_end", end)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.calculated_at) {
      const ageMinutes =
        (Date.now() - new Date(existing.calculated_at).getTime()) / 60000;
      if (ageMinutes < COOLDOWN_MINUTES) {
        return { status: "cooldown", calculatedAt: existing.calculated_at };
      }
    }

    // 5. Calcul (session utilisateur).
    const result = await computeCompliance(supabase, companyId, settings, start, end);

    if (result.insufficient) {
      return {
        status: "insufficient",
        measurable: result.details.measurable_actions,
        required: settings.min_sample,
      };
    }

    // 6. Insertion : clé de service uniquement ici.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const { error } = await admin.from("compliance_scores").insert({
      entity_id: companyId,
      period_start: start,
      period_end: end,
      score: result.score,
      details: result.details,
      calculated_by: userId,
    });
    if (error) throw new Error(error.message);

    return { status: "ok", periodStart: start, periodEnd: end, ...result };
  });

/** Dernier score connu pour l'entreprise de l'appelant (lecture seule). */
export const getLatestComplianceScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  // Aucun paramètre client : ni score, ni période.
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }: any): Promise<any> => {
    const supabase: any = context.supabase;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem?.company_id) return null;

    const { data } = await supabase
      .from("compliance_scores")
      .select("score, details, period_start, period_end, calculated_at")
      .eq("entity_id", mem.company_id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ?? null;
  });

/** Réglages du score + droit de modification de l'appelant. */
export const getComplianceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any): Promise<any> => {
    const supabase: any = context.supabase;
    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem?.company_id) return null;

    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", mem.company_id)
      .maybeSingle();

    const { data: settings } = await supabase
      .from("compliance_settings")
      .select("*")
      .eq("entity_id", mem.company_id)
      .maybeSingle();

    const isManager =
      company?.owner_id === context.userId ||
      ["owner", "admin"].includes(String(mem.role ?? ""));

    return { settings: settings ?? null, isManager };
  });

const SettingsInput = z.object({
  weight_punctuality: z.number().int().min(0).max(100),
  weight_completeness: z.number().int().min(0).max(100),
  weight_incidents: z.number().int().min(0).max(100),
  weight_regularity: z.number().int().min(0).max(100),
  report_due_hour: z.number().int().min(0).max(23),
  incident_sla_days: z.number().int().min(1).max(90),
  grace_days: z.number().int().min(0).max(15),
  min_sample: z.number().int().min(5).max(1000),
});

/**
 * Mise à jour des réglages. Les quatre poids sont enregistrés EN UNE FOIS :
 * la contrainte SQL exige une somme de 100, une sauvegarde poids par poids
 * échouerait à chaque étape intermédiaire.
 */
export const updateComplianceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsInput.parse(d))
  .handler(async ({ data, context }: any): Promise<any> => {
    const supabase: any = context.supabase;
    const total =
      data.weight_punctuality +
      data.weight_completeness +
      data.weight_incidents +
      data.weight_regularity;
    if (total !== 100) {
      throw new Error(`La somme des pondérations doit valoir 100 (actuellement ${total}).`);
    }

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem?.company_id) throw new Error("Vous devez appartenir à une entreprise.");

    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", mem.company_id)
      .maybeSingle();
    const isManager =
      company?.owner_id === context.userId ||
      ["owner", "admin"].includes(String(mem.role ?? ""));
    if (!isManager) throw new Error("Seul un gestionnaire peut modifier les pondérations.");

    const { error } = await supabase
      .from("compliance_settings")
      .update({ ...data, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("entity_id", mem.company_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });