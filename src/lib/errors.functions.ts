import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ErrorEvent = {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  path: string | null;
  user_agent: string | null;
  context: Record<string, any>;
  created_at: string;
};

const payloadSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Enregistre une erreur survenue dans le navigateur.
 * Volontairement silencieux : ne doit jamais faire échouer l'application.
 */
export const logClientError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();

    await supabase.from("error_events").insert({
      message: data.message,
      stack: data.stack ?? null,
      path: data.path ?? null,
      user_id: userId,
      company_id: mem?.company_id ?? null,
      user_agent: data.context?.["userAgent"] ? String(data.context["userAgent"]) : null,
      context: data.context ?? {},
    });

    return { ok: true };
  });

async function assertPlatformAdmin(userId: string): Promise<void> {
  const { supabaseAdmin: adminRaw } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin: any = adminRaw;
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Accès réservé aux administrateurs de la plateforme.");
}

export const listErrorEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ErrorEvent[]> => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin: adminRaw } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin: any = adminRaw;
    const { data } = await supabaseAdmin
      .from("error_events")
      .select("id, level, message, stack, path, user_agent, context, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return ((data ?? []) as ErrorEvent[]) ?? [];
  });

export const clearErrorEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin: adminRaw } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin: any = adminRaw;
    await supabaseAdmin.from("error_events").delete().lt("created_at", new Date().toISOString());
    return { ok: true };
  });
