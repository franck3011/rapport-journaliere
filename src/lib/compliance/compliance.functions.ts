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
