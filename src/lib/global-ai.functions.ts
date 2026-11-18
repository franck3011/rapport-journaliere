import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAiQuota } from "@/lib/ai-quota";

const input = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(30)
    .default([]),
});

// Assistant transversal : lit (sous RLS de l'utilisateur) projets, documents et notes de frais.
// Le cœur de la logique vit dans global-ai.server.ts, partagé avec les autres agents.
export const globalAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<{ reply: string }> => {
    const { answerGlobally } = await import("./global-ai.server");
    const reply = await answerGlobally({
      supabase: context.supabase,
      userId: context.userId,
      message: data.message,
      history: data.history,
    });
    return { reply };
  });
