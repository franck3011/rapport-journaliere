import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ReviewSeverity = "info" | "warning" | "error";

export type ReviewFinding = {
  severity: ReviewSeverity;
  section: string;
  message: string;
  suggestion: string;
};

export type ReviewResult = {
  score: number;
  summary: string;
  findings: ReviewFinding[];
};

const SYSTEM = `Tu es le CONTRÔLEUR DE COHÉRENCE d'un rapport professionnel.
Tu ne rédiges pas le rapport : tu relèves ce qui ne tient pas debout avant qu'il soit envoyé.

Tu cherches, dans cet ordre de gravité :
1. les contradictions (un chiffre qui contredit un autre, une date incohérente, un « terminé » ailleurs annoncé « en cours ») ;
2. les informations essentielles manquantes (qui, quoi, quand, où, combien) ;
3. les sections vides ou réduites à un titre ;
4. les doublons (même information répétée dans deux sections) ;
5. les affirmations sans preuve (« tout va bien » sans élément) ;
6. les textes de remplissage évidents (lorem, « à compléter », points de suspension).

Règles absolues :
- Tu ne réécris jamais le rapport, tu signales et tu proposes.
- Une remarque par problème réel, jamais deux fois le même.
- Maximum 8 remarques, les plus graves d'abord.
- Si le document est cohérent, dis-le et renvoie une liste vide.
- Écris en français, phrases courtes, sans jargon.

Réponds UNIQUEMENT par un objet JSON valide :
{
  "score": <entier 0-100, 100 = prêt à envoyer>,
  "summary": "<une phrase de verdict>",
  "findings": [
    {
      "severity": "error" | "warning" | "info",
      "section": "<titre exact de la section concernée, ou 'Général'>",
      "message": "<ce qui ne va pas>",
      "suggestion": "<ce qu'il faut faire, en une phrase>"
    }
  ]
}`;

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

function buildDocument(data: z.infer<typeof inputSchema>): string {
  const lines: string[] = [];
  lines.push(`TITRE : ${data.title || "(sans titre)"}`);
  if (data.intro.trim()) lines.push(`\nINTRODUCTION :\n${data.intro.trim()}`);

  data.sections.forEach((section, index) => {
    lines.push(`\n--- SECTION ${index + 1} : ${section.title || "(sans titre)"} ---`);
    if (section.description.trim()) lines.push(`Description : ${section.description.trim()}`);
    if (section.bullets.length === 0) {
      lines.push("(aucun contenu dans cette section)");
    } else {
      for (const bullet of section.bullets) {
        if (bullet.trim()) lines.push(`- ${bullet.trim()}`);
      }
    }
  });

  if (data.conclusion.trim()) lines.push(`\nCONCLUSION :\n${data.conclusion.trim()}`);
  return lines.join("\n");
}

function normalize(raw: any): ReviewResult {
  const findings: ReviewFinding[] = Array.isArray(raw?.findings)
    ? raw.findings
        .slice(0, 8)
        .map((f: any) => ({
          severity: f?.severity === "error" || f?.severity === "warning" ? f.severity : "info",
          section: typeof f?.section === "string" && f.section.trim() ? f.section.trim() : "Général",
          message: typeof f?.message === "string" ? f.message.trim() : "",
          suggestion: typeof f?.suggestion === "string" ? f.suggestion.trim() : "",
        }))
        .filter((f: ReviewFinding) => f.message.length > 0)
    : [];

  const score = Math.max(
    0,
    Math.min(100, Number.isFinite(Number(raw?.score)) ? Math.round(Number(raw.score)) : 60),
  );

  return {
    score,
    summary:
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "Analyse terminée.",
    findings,
  };
}

/**
 * Relit l'intégralité d'un rapport et signale les incohérences.
 * Ne modifie jamais le document : c'est un contrôle, pas une réécriture.
 */
export const reviewReportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ReviewResult> => {
    const { callAI, parseJsonLoose } = await import("@/lib/ai-gateway.server");

    const document = buildDocument(data);
    if (document.replace(/\s/g, "").length < 40) {
      return {
        score: 0,
        summary: "Le document est presque vide : rien à contrôler pour le moment.",
        findings: [
          {
            severity: "error",
            section: "Général",
            message: "Le rapport ne contient pas encore de contenu exploitable.",
            suggestion: "Ajoutez au moins une section avec ses observations avant de lancer le contrôle.",
          },
        ],
      };
    }

    const raw = await callAI({
      system: SYSTEM,
      messages: [{ role: "user", content: document }],
      json: true,
      temperature: 0.1,
    });

    return normalize(parseJsonLoose<any>(raw));
  });
