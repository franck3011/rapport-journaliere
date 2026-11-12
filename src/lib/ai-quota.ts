import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Quota d'usage IA : 80 appels par utilisateur sur une fenêtre glissante de 24 h.
 * Les endpoints IA (extraction PDF, OCR, chat, agents, TTS, transcription) sont
 * facturés au crédit : sans plafond, un compte gratuit peut épuiser le budget.
 *
 * Le contrôle est volontairement « fail-open » : si la table ai_usage_events
 * n'existe pas encore (migration non appliquée), les fonctions IA continuent de
 * répondre normalement plutôt que de tomber en panne.
 */
const DAILY_LIMIT = 80;

export class AiQuotaExceededError extends Error {
  constructor() {
    super(
      "Quota quotidien d'analyses IA atteint. Réessayez demain ou contactez votre administrateur.",
    );
    this.name = "AiQuotaExceededError";
  }
}

export async function assertAiQuota(supabase: any, userId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (error) return; // table absente ou RLS indisponible : on n'empêche pas l'app de fonctionner
    if ((count ?? 0) >= DAILY_LIMIT) throw new AiQuotaExceededError();

    await supabase.from("ai_usage_events").insert({ user_id: userId });
  } catch (err) {
    if (err instanceof AiQuotaExceededError) throw err;
    console.warn("[ai-quota] vérification ignorée :", err);
  }
}

/**
 * Middleware à chaîner après requireSupabaseAuth :
 *   .middleware([requireSupabaseAuth, requireAiQuota])
 */
export const requireAiQuota = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const { supabase, userId } = context as unknown as {
      supabase: any;
      userId: string;
    };
    if (userId) await assertAiQuota(supabase, userId);
    return next();
  },
);
