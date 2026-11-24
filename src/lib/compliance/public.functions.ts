import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Vérification publique d'une attestation.
 *
 * Aucune authentification : la fonction n'expose que le nom de l'entreprise,
 * le score, la période et la date de calcul — jamais d'identifiant, jamais le
 * détail des critères. Le code fait office de secret de lecture (8 caractères).
 */
export const getPublicCompliance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(4).max(40) }).parse(d),
  )
  .handler(async ({ data }): Promise<any> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;

    const { data: rows, error } = await admin.rpc("compliance_public_lookup", {
      p_code: data.code,
    });
    if (error) return { found: false, error: error.message };

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { found: false };

    return {
      found: true,
      company_name: row.company_name,
      score: row.score,
      period_start: row.period_start,
      period_end: row.period_end,
      calculated_at: row.calculated_at,
    };
  });
