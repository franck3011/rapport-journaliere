import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ReviewSeverity = "info" | "warning" | "error";
export type ReviewCategory = "fond" | "forme";

export type ReviewFinding = {
  severity: ReviewSeverity;
  category: ReviewCategory;
  section: string;
  message: string;
  suggestion: string;
};

export type ReviewResult = {
  /** note globale 0-100 */
  score: number;
  /** cohérence du contenu 0-100 */
  coherence: number;
  /** qualité de forme 0-100 */
  form: number;
  summary: string;
  findings: ReviewFinding[];
  /** true si la seconde lecture a validé les remarques */
  verified: boolean;
};

const SYSTEM = `Tu es le CONTRÔLEUR D'UN RAPPORT PROFESSIONNEL.
Tu ne rédiges rien : tu relèves tout ce qui empêcherait ce rapport d'être envoyé tel quel.
Tu es exigeant : ce rapport sera lu par un directeur ou un client. Il doit être PROPRE.

Tu contrôles DEUX grilles.

A. LE FOND (cohérence)
1. contradictions : un chiffre qui contredit un autre, une date incohérente, « terminé » ici et « en cours » là ;
2. informations essentielles manquantes : qui, quoi, quand, où, combien ;
3. sections vides ou réduites à un titre ;
4. doublons : même information répétée ;
5. affirmations sans preuve (« tout va bien » sans élément) ;
6. textes de remplissage (lorem, « à compléter », points de suspension).

B. LA FORME (qualité rédactionnelle)
7. fautes d'orthographe, accords, conjugaison, ponctuation ;
8. phrases inachevées ou télégraphiques incompréhensibles ;
9. ton inadapté : familiarité, oral, émojis, majuscules criardes ;
10. titres de sections vagues (« Divers », « Autre », « Suite ») ;
11. jargon interne non explicité, abréviations non définies ;
12. incohérence de temps (passé/présent/futur mélangés) ou de personne (je/nous).

Règles absolues :
- Tu ne réécris jamais le rapport : tu signales et tu proposes une correction courte.
- Une remarque = un problème réel. Jamais deux fois le même.
- Maximum 10 remarques, les plus graves d'abord.
- Si tout est propre, dis-le franchement et ne cherche pas de défaut pour en trouver un.
- Français, phrases courtes, sans jargon.

Réponds UNIQUEMENT par un objet JSON valide :
{
  "score": <entier 0-100, note globale>,
  "coherence": <entier 0-100, grille A>,
  "form": <entier 0-100, grille B>,
  "summary": "<une phrase de verdict>",
  "findings": [
    {
      "severity": "error" | "warning" | "info",
      "category": "fond" | "forme",
      "section": "<titre exact de la section, ou 'Général'>",
      "message": "<ce qui ne va pas>",
      "suggestion": "<la correction, en une phrase>"
    }
  ]
}`;

const VERIFIER = `Tu es le VÉRIFICATEUR. Un premier agent a relu ce rapport et produit les remarques ci-dessous.
Ta seule mission : ne garder que ce qui est RÉELLEMENT justifié par le document.

Élimine sans hésiter :
- les remarques approximatives ou supposées (« il manque peut-être… ») ;
- celles qui reprochent un choix d'auteur légitime (ton direct, phrase courte, style télégraphique volontaire) ;
- les doublons et les reformulations d'un même problème.

Conserve et reformule plus précisément ce qui est vrai. Puis ajuste les notes
pour qu'elles correspondent à l'état réel du document.

Réponds UNIQUEMENT par le même objet JSON :
{ "score": <0-100>, "coherence": <0-100>, "form": <0-100>, "summary": "<verdict>", "findings": [ ... ] }`;

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

const clampScore = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};

function normalize(raw: any, verified: boolean): ReviewResult {
  const findings: ReviewFinding[] = Array.isArray(raw?.findings)
    ? raw.findings
        .slice(0, 10)
        .map((f: any) => ({
          severity: f?.severity === "error" || f?.severity === "warning" ? f.severity : "info",
          category: f?.category === "forme" ? "forme" : "fond",
          section: typeof f?.section === "string" && f.section.trim() ? f.section.trim() : "Général",
          message: typeof f?.message === "string" ? f.message.trim() : "",
          suggestion: typeof f?.suggestion === "string" ? f.suggestion.trim() : "",
        }))
        .filter((f: ReviewFinding) => f.message.length > 0)
    : [];

  const coherence = clampScore(raw?.coherence, clampScore(raw?.score, 60));
  const form = clampScore(raw?.form, clampScore(raw?.score, 60));

  return {
    score: clampScore(raw?.score, Math.round((coherence + form) / 2)),
    coherence,
    form,
    summary:
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "Analyse terminée.",
    findings,
    verified,
  };
}

/**
 * Relit l'intégralité d'un rapport : cohérence du fond ET qualité de forme.
 * Ne modifie jamais le document.
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
        coherence: 0,
        form: 0,
        verified: false,
        summary: "Le document est presque vide : rien à contrôler pour le moment.",
        findings: [
          {
            severity: "error",
            category: "fond",
            section: "Général",
            message: "Le rapport ne contient pas encore de contenu exploitable.",
            suggestion:
              "Ajoutez au moins une section avec ses observations avant de lancer le contrôle.",
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

    const first = normalize(parseJsonLoose<any>(raw), false);

    // Seconde lecture : le vérificateur filtre ses propres remarques.
    // En cas d'échec, on renvoie la première analyse plutôt que rien.
    try {
      const verifiedRaw = await callAI({
        system: VERIFIER,
        messages: [
          {
            role: "user",
            content: `${document}\n\n--- REMARQUES À VÉRIFIER ---\n${JSON.stringify(
              first.findings,
              null,
              2,
            )}`,
          },
        ],
        json: true,
        temperature: 0,
      });
      return normalize(parseJsonLoose<any>(verifiedRaw), true);
    } catch {
      return first;
    }
  });
