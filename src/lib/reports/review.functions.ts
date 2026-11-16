import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ReviewResult } from "./review.server";

export type {
  ReviewSeverity,
  ReviewCategory,
  ReviewFinding,
  ReviewResult,
} from "./review.server";

const sectionSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(2000).optional().default(""),
  bullets: z.array(z.string().max(3000)).max(80).default([]),
});

const inputSchema = z.object({
  title: z.string().max(300).default(""),
  intro: z.string().max(6000).optional().default(""),
  conclusion: z.string().max(6000).optional().default(""),
  sections: z.array(sectionSchema).max(40).default([]),
});

/**
 * Relit l'intégralité d'un rapport : cohérence du fond ET qualité de forme.
 * Ne modifie jamais le document. Logique partagée avec le pipeline d'agents.
 */
export const reviewReportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ReviewResult> => {
    const { reviewDocument } = await import("./review.server");
    return reviewDocument(data);
  });
