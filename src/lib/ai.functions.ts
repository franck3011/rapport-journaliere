import { historyAsContext } from "./ai-history";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAiQuota } from "@/lib/ai-quota";
import { z } from "zod";
import {
  callAI,
  parseJsonLoose,
  DEFAULT_MODEL,
  PRO_MODEL,
  type AIMessage,
} from "./ai-gateway.server";

// ----- Shared schemas -----

const extractedSchema = z.object({
  title: z.string().default(""),
  intro: z.string().default(""),
  conclusion: z.string().default(""),
  sections: z
    .array(
      z.object({
        title: z.string().default(""),
        description: z.string().default(""),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type ExtractedReport = z.infer<typeof extractedSchema>;

const REPORT_JSON_SHAPE =
  '{"title": string, "intro": string, "conclusion": string, "sections": [{"title": string, "description": string, "bullets": [string]}]}';

/**
 * Plafond de charge utile base64 (≈ 28 M caractères, soit ~20 Mo de fichier
 * décodé). Sans borne, un appelant authentifié pouvait envoyer plusieurs
 * centaines de Mo et saturer la mémoire de l'instance.
 */
const MAX_BASE64_CHARS = 28_000_000;

const STYLE_HINTS: Record<string, string> = {
  administratif: "ton administratif, formel, phrases complètes, vocabulaire soutenu",
  technique: "ton technique précis, terminologie métier, mesures et références",
  chantier: "ton opérationnel de chantier, avancement, tâches, sécurité, matériel",
  intervention: "ton d'intervention terrain, actions menées, résultats, durée",
  maintenance: "ton de maintenance : équipement, symptômes, diagnostic, actions, pièces",
  mission: "ton de rapport de mission, objectifs, résultats, difficultés, suites",
  visite: "ton de rapport de visite, contexte, personnes rencontrées, constats",
  audit: "ton d'audit, constats, écarts, risques, recommandations, plan d'action",
};

function styleClause(style?: string): string {
  if (!style || !STYLE_HINTS[style]) return "";
  return ` Adopte un ${STYLE_HINTS[style]}.`;
}

// ----- Legacy: extract from PDF -----

const pdfInput = z.object({
  pdfBase64: z.string().min(10).max(MAX_BASE64_CHARS),
  mimeType: z.string().default("application/pdf"),
  filename: z.string().default("document.pdf"),
});

export const extractReportFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((data: unknown) => pdfInput.parse(data))
  .handler(async ({ data }): Promise<ExtractedReport> => {
    const text = await callAI({
      model: DEFAULT_MODEL,
      system:
        "Tu es un assistant qui analyse des rapports d'activités PDF en français et en extrait la structure. Réponds uniquement avec un JSON strict.",
      json: true,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extrait la structure de ce rapport en JSON exact :\n" +
                REPORT_JSON_SHAPE +
                "\nUtilise le français. Aucun texte hors JSON.",
            },
            {
              type: "file",
              file: {
                filename: data.filename,
                file_data: `data:${data.mimeType};base64,${data.pdfBase64}`,
              },
            },
          ],
        },
      ],
    });
    return extractedSchema.parse(parseJsonLoose(text));
  });

// ----- Extract from image -----

const imageInput = z.object({
  base64: z.string().min(10).max(MAX_BASE64_CHARS),
  mimeType: z.string().default("image/jpeg"),
});

export const aiExtractFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => imageInput.parse(d))
  .handler(async ({ data }): Promise<ExtractedReport> => {
    const text = await callAI({
      model: DEFAULT_MODEL,
      system:
        "Tu lis des photos de rapports ou de notes manuscrites en français et tu produis un JSON structuré. Réponds uniquement en JSON.",
      json: true,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "OCR + structure ce document en JSON :\n" +
                REPORT_JSON_SHAPE +
                "\nEn français, JSON uniquement.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${data.mimeType};base64,${data.base64}` },
            },
          ],
        },
      ],
    });
    return extractedSchema.parse(parseJsonLoose(text));
  });

// ----- Extract from DOCX -----

const docxInput = z.object({
  base64: z.string().min(10).max(MAX_BASE64_CHARS),
  filename: z.string().default("document.docx"),
});

export const aiExtractFromDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => docxInput.parse(d))
  .handler(async ({ data }): Promise<ExtractedReport> => {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(data.base64, "base64");
    const { value: rawText } = await mammoth.extractRawText({ buffer });
    const clipped = rawText.slice(0, 30_000);

    const text = await callAI({
      model: DEFAULT_MODEL,
      system:
        "Tu structures des textes bruts issus de documents Word en rapports JSON en français. Réponds uniquement en JSON.",
      json: true,
      messages: [
        {
          role: "user",
          content:
            "Structure ce contenu Word en JSON exact :\n" +
            REPORT_JSON_SHAPE +
            "\nContenu :\n\n" +
            clipped,
        },
      ],
    });
    return extractedSchema.parse(parseJsonLoose(text));
  });

// ----- Improve a text field -----

const improveInput = z.object({
  text: z.string().min(1),
  action: z.enum(["fix-fr", "rephrase", "shorten", "expand"]),
  style: z.string().optional(),
});

const ACTION_INSTRUCTION: Record<string, string> = {
  "fix-fr":
    "Corrige uniquement l'orthographe, la grammaire et la ponctuation. Ne change pas le sens ni le style.",
  rephrase:
    "Reformule pour améliorer la fluidité et la clarté, en conservant tous les faits et le même niveau de détail.",
  shorten:
    "Résume le texte en 40 % environ de sa longueur, en gardant les informations essentielles.",
  expand:
    "Développe le texte avec plus de détails et de nuances, sans inventer de faits.",
};

export const aiImprove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => improveInput.parse(d))
  .handler(async ({ data }): Promise<{ text: string }> => {
    const text = await callAI({
      model: DEFAULT_MODEL,
      system:
        "Tu es un assistant de rédaction professionnelle en français." + styleClause(data.style),
      messages: [
        {
          role: "user",
          content:
            ACTION_INSTRUCTION[data.action] +
            "\n\nRenvoie uniquement le texte final, sans commentaire ni guillemets.\n\nTEXTE :\n" +
            data.text,
        },
      ],
    });
    return { text: text.trim() };
  });

// ----- Summarize -----

const reportShape = z.object({
  title: z.string().default(""),
  intro: z.string().default(""),
  conclusion: z.string().default(""),
  sections: z
    .array(
      z.object({
        title: z.string().default(""),
        description: z.string().default(""),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const summarizeInput = z.object({
  report: reportShape,
  mode: z.enum(["short", "executive"]),
});

function reportToText(r: z.infer<typeof reportShape>): string {
  const lines: string[] = [];
  if (r.title) lines.push(`# ${r.title}`);
  if (r.intro) lines.push(`\nIntroduction :\n${r.intro}`);
  r.sections.forEach((s, i) => {
    lines.push(`\n## Section ${i + 1} — ${s.title}`);
    if (s.description) lines.push(s.description);
    s.bullets.forEach((b) => lines.push(`- ${b}`));
  });
  if (r.conclusion) lines.push(`\nConclusion :\n${r.conclusion}`);
  return lines.join("\n");
}

export const aiSummarize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => summarizeInput.parse(d))
  .handler(async ({ data }): Promise<{ summary: string }> => {
    const instruction =
      data.mode === "short"
        ? "Rédige un résumé court en 3 à 5 phrases, en français."
        : "Rédige un résumé exécutif structuré (contexte, faits clés, recommandations) en français, ~200 mots.";
    const text = await callAI({
      model: DEFAULT_MODEL,
      system: "Tu es un assistant de synthèse de rapports professionnels.",
      messages: [
        {
          role: "user",
          content: instruction + "\n\nRAPPORT :\n" + reportToText(data.report),
        },
      ],
    });
    return { summary: text.trim() };
  });

// ----- Detect issues -----

const issueSchema = z.object({
  issues: z
    .array(
      z.object({
        type: z.string(),
        message: z.string(),
        location: z.string().default(""),
      }),
    )
    .default([]),
});

const detectInput = z.object({ report: reportShape });

export const aiDetectIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => detectInput.parse(d))
  .handler(async ({ data }): Promise<z.infer<typeof issueSchema>> => {
    const text = await callAI({
      model: PRO_MODEL,
      system:
        "Tu es un relecteur d'audit. Trouve incohérences (dates, chiffres, montants), affirmations contradictoires, doublons, informations manquantes clés. Réponds en JSON strict.",
      json: true,
      messages: [
        {
          role: "user",
          content:
            "Analyse ce rapport et renvoie ce JSON exact :\n" +
            '{"issues": [{"type": "date"|"montant"|"incohérence"|"doublon"|"manquant"|"autre", "message": string, "location": string}]}\n\n' +
            "RAPPORT :\n" +
            reportToText(data.report),
        },
      ],
    });
    return issueSchema.parse(parseJsonLoose(text));
  });

// ----- Apply style -----

const applyStyleInput = z.object({
  report: reportShape,
  style: z.string(),
});

export const aiApplyStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => applyStyleInput.parse(d))
  .handler(async ({ data }): Promise<ExtractedReport> => {
    const text = await callAI({
      model: PRO_MODEL,
      system:
        "Tu reformules des rapports en français en gardant tous les faits mais en changeant le ton." +
        styleClause(data.style),
      json: true,
      messages: [
        {
          role: "user",
          content:
            "Reformule ce rapport dans le style demandé. Renvoie ce JSON exact, sans texte hors JSON :\n" +
            REPORT_JSON_SHAPE +
            "\n\nRAPPORT SOURCE :\n" +
            reportToText(data.report),
        },
      ],
    });
    return extractedSchema.parse(parseJsonLoose(text));
  });

// ----- Chat -----

const chatMsg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const chatInput = z.object({
  history: z.array(chatMsg).default([]),
  userMessage: z.string().min(1),
  reportDraft: reportShape.optional(),
  style: z.string().optional(),
});

const chatReplySchema = z.object({
  reply: z.string().default(""),
  updatedDraft: extractedSchema.nullable().optional(),
  missingInfo: z.array(z.string()).default([]),
  intent: z.string().optional(),
  changes: z.array(z.string()).default([]),
  clarification: z
    .object({ question: z.string().default(""), options: z.array(z.string()).default([]) })
    .nullable()
    .optional(),
});
export type AIChatReply = z.infer<typeof chatReplySchema>;

const EDIT_RULES =
  " RÈGLES D'AGENT (comme un agent de code : modifier par retouches ciblées, jamais tout réécrire) : " +
  "1) Identifie d'abord l'intention : AJOUT, MODIFICATION ciblée, SUPPRESSION explicite, ou QUESTION/changement de sujet. " +
  "2) AJOUT : recopie À L'IDENTIQUE tout le contenu existant (titre, intro, chaque section, chaque puce, conclusion) et insère seulement le nouveau contenu au bon endroit. " +
  "3) MODIFICATION : ne change QUE l'élément visé ; tout le reste est recopié mot pour mot, dans le même ordre, avec les mêmes titres de section. " +
  "4) SUPPRESSION : uniquement si l'utilisateur le demande explicitement. " +
  "5) QUESTION, avis ou changement de sujet : réponds dans reply et mets updatedDraft à null ; ne touche pas au rapport. " +
  "6) Ne réordonne et ne renomme jamais les sections sans demande : les photos y sont rattachées. " +
  "7) Garde le fil de la conversation : comprends les références implicites (« comme tout à l'heure », « ce point-là ») grâce à l'historique. " +
  "Dans reply, dis brièvement ce que tu as compris et ce que tu as changé.";

const PATCH_TOOLS =
  "OUTILS DE RETOUCHE (tu ne réécris jamais le rapport, tu émets des opérations atomiques appliquées par le système) :\n" +
  '- {"op":"set_title","value"} | {"op":"set_intro","value"} | {"op":"append_intro","value"} | {"op":"set_conclusion","value"} | {"op":"append_conclusion","value"}\n' +
  '- {"op":"add_section","title","description","bullets":[...]} (ajoutée à la fin)\n' +
  '- {"op":"update_section","index","title"?,"description"?} (remplace seulement les champs fournis)\n' +
  '- {"op":"append_to_section","index","text"?,"bullets"?}\n' +
  '- {"op":"remove_section","index"} (UNIQUEMENT sur demande explicite)\n' +
  '- {"op":"add_bullet","index","value"} | {"op":"update_bullet","index","bullet_index","value"} | {"op":"remove_bullet","index","bullet_index"}\n' +
  '- {"op":"replace_text","find","replace"} (correction précise d\'un mot ou d\'une phrase exacte)\n' +
  "Les index sont 0-based et se réfèrent aux sections du brouillon fourni (numérotées [n]).";

const AGENT_LOOP =
  "PROCESSUS (comme un agent professionnel) : comprendre → décider → agir → rendre compte.\n" +
  "- intent ∈ question | add | edit | delete | create | clarify.\n" +
  "- Si la demande est AMBIGUË ou qu'il manque une information indispensable (quelle partie ? quel chiffre ? quelle date ?), n'agis pas : intent=clarify, operations=[], " +
  'et remplis clarification={"question": "...", "options": ["2 à 4 réponses courtes cliquables"]}. Ne pose qu\'UNE question, la plus utile.\n' +
  "- Si l'utilisateur change de sujet ou pose une question générale, réponds simplement (intent=question, operations=[]).\n" +
  "- Rapport vide et demande de rédaction : utilise set_title/set_intro/add_section/set_conclusion (intent=create).\n" +
  "- N'invente jamais de chiffres, noms ou dates : demande-les ou laisse « [à compléter] ».\n" +
  "- reply : 1 à 3 phrases, ce que tu as compris et fait. Pas de liste des opérations (le système l'affiche).";

function draftForPrompt(d: z.infer<typeof reportShape> | undefined): string {
  if (!d) return "(rapport vide)";
  const secs = (d.sections ?? [])
    .map((s: any, i: number) => `[${i}] ${JSON.stringify({ title: s.title, description: s.description, bullets: s.bullets ?? [] })}`)
    .join("\n");
  return `title: ${JSON.stringify(d.title ?? "")}\nintro: ${JSON.stringify(d.intro ?? "")}\nsections:\n${secs || "(aucune)"}\nconclusion: ${JSON.stringify(d.conclusion ?? "")}`;
}

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => chatInput.parse(d))
  .handler(async ({ data }): Promise<AIChatReply> => {
    const { applyPatch } = await import("./report-patch");
    const system =
      "Tu es l'agent de rédaction de rapports professionnels de DailyBrief, en français. " +
      "Tu travailles comme un agent de développement : tu comprends l'intention, tu poses une question si nécessaire, puis tu fais des retouches chirurgicales.\n" +
      EDIT_RULES + "\n" + PATCH_TOOLS + "\n" + AGENT_LOOP + "\n" +
      "Réponds STRICTEMENT en JSON : " +
      '{"intent": string, "reply": string, "operations": [ ... ], "clarification": null | {"question": string, "options": [string]}, "missingInfo": [string]}' +
      styleClause(data.style);

    const messages: AIMessage[] = [];
    messages.push(...historyAsContext(data.history.slice(-16)));
    messages.push({
      role: "user",
      content: `ÉTAT ACTUEL DU RAPPORT (source de vérité, ne pas répéter) :\n${draftForPrompt(data.reportDraft)}\n\nDEMANDE : ${data.userMessage}`,
    });

    const text = await callAI({ model: DEFAULT_MODEL, system, json: true, messages });
    const raw: any = parseJsonLoose(text) ?? {};
    const ops = Array.isArray(raw.operations) ? raw.operations : [];
    const clar = raw.clarification && typeof raw.clarification === "object" && raw.clarification.question
      ? { question: String(raw.clarification.question), options: (Array.isArray(raw.clarification.options) ? raw.clarification.options : []).map(String).slice(0, 4) }
      : null;
    let updatedDraft: ExtractedReport | null = null;
    let changes: string[] = [];
    if (ops.length && !clar) {
      const r = applyPatch(data.reportDraft as any, ops);
      if (r.applied.length) { updatedDraft = r.draft; changes = r.applied; }
    }
    return {
      reply: String(raw.reply ?? "") || (clar ? clar.question : "C'est noté."),
      updatedDraft,
      missingInfo: Array.isArray(raw.missingInfo) ? raw.missingInfo.map(String) : [],
      intent: typeof raw.intent === "string" ? raw.intent : undefined,
      changes,
      clarification: clar,
    };
  });

// ----- Generate the full report -----

const generateInput = z.object({
  history: z.array(chatMsg).default([]),
  reportDraft: reportShape.optional(),
  style: z.string().optional(),
});

export const aiGenerateFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => generateInput.parse(d))
  .handler(async ({ data }): Promise<ExtractedReport> => {
    const system =
      "Tu es un rédacteur de rapports professionnels en français. À partir de l'historique de conversation et du brouillon fourni, produis un rapport complet et structuré." +
      styleClause(data.style) +
      " Style note administrative fluide : paragraphes espacés qui s'enchaînent naturellement, puces si utile, gras sur les points clés. N'écris JAMAIS de titres ou étiquettes 'Introduction', 'Développement' ou 'Conclusion'. " +
      "Utilise `intro` pour le paragraphe d'ouverture, des sections sans titre générique (titre vide si inutile), `conclusion` pour la formule de clôture. Réponds STRICTEMENT en JSON exact.";
    const convo = data.history
      .map((m) => `${m.role === "assistant" ? "ASSISTANT" : "UTILISATEUR"} : ${m.content}`)
      .join("\n\n");
    const draftJson = data.reportDraft ? JSON.stringify(data.reportDraft) : "aucun";

    const text = await callAI({
      model: PRO_MODEL,
      system,
      json: true,
      messages: [
        {
          role: "user",
          content:
            "Rédige le rapport final. JSON exact :\n" +
            REPORT_JSON_SHAPE +
            "\n\nBROUILLON ACTUEL : " +
            draftJson +
            "\n\nCONVERSATION :\n" +
            convo,
        },
      ],
    });
    return extractedSchema.parse(parseJsonLoose(text));
  });

// ----- Extract from MULTIPLE PDFs -----

const MAX_PDFS = 10;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const multiPdfInput = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().default("document.pdf"),
        base64: z.string().min(10).max(MAX_BASE64_CHARS),
        mimeType: z.string().default("application/pdf"),
      }),
    )
    .min(1)
    .max(MAX_PDFS),
  mode: z.enum(["merge", "per-document"]).default("merge"),
  style: z.string().optional(),
});

export type MultiPdfFileStatus = {
  filename: string;
  ok: boolean;
  error?: string;
};

export type MultiPdfResult = {
  report: ExtractedReport;
  perFile: MultiPdfFileStatus[];
};

function base64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

async function extractOnePdf(
  file: { filename: string; base64: string; mimeType: string },
  style?: string,
): Promise<ExtractedReport> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await callAI({
        model: DEFAULT_MODEL,
        system:
          "Tu analyses des rapports PDF en français et en extrais la structure. Réponds uniquement avec un JSON strict." +
          styleClause(style),
        json: true,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Extrait la structure de ce document en JSON exact :\n" +
                  REPORT_JSON_SHAPE +
                  "\nUtilise le français. Aucun texte hors JSON.",
              },
              {
                type: "file",
                file: {
                  filename: file.filename,
                  file_data: `data:${file.mimeType};base64,${file.base64}`,
                },
              },
            ],
          },
        ],
      });
      return extractedSchema.parse(parseJsonLoose(text));
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Only retry transient failures (rate limit / upstream errors).
      const transient = /Limite de requêtes|\(5\d\d\)/.test(msg);
      if (!transient) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Lecture du PDF impossible");
}

export const aiExtractFromPdfs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => multiPdfInput.parse(d))
  .handler(async ({ data }): Promise<MultiPdfResult> => {
    const perFile: MultiPdfFileStatus[] = [];
    const extracted: { filename: string; report: ExtractedReport }[] = [];

    // Sequential: keeps us under the gateway's shared rate-limit budget.
    for (const f of data.files) {
      if (base64Bytes(f.base64) > MAX_PDF_BYTES) {
        perFile.push({ filename: f.filename, ok: false, error: "Fichier trop volumineux (max 20 Mo)" });
        continue;
      }
      try {
        const r = await extractOnePdf(f, data.style);
        extracted.push({ filename: f.filename, report: r });
        perFile.push({ filename: f.filename, ok: true });
      } catch (e) {
        perFile.push({
          filename: f.filename,
          ok: false,
          error: e instanceof Error ? e.message : "Lecture impossible",
        });
      }
    }

    if (extracted.length === 0) {
      return {
        report: { title: "", intro: "", conclusion: "", sections: [] },
        perFile,
      };
    }

    if (data.mode === "per-document" || extracted.length === 1) {
      if (extracted.length === 1) {
        const only = extracted[0]!;
        if (data.mode === "merge") return { report: only.report, perFile };
      }
      const report: ExtractedReport = {
        title: extracted[0]!.report.title || "Rapport consolidé",
        intro: "",
        conclusion: "",
        sections: extracted.map((e) => {
          const r = e.report;
          const bullets = [
            ...r.sections.flatMap((s) => [
              ...(s.title ? [s.title + (s.description ? " : " + s.description : "")] : s.description ? [s.description] : []),
              ...s.bullets,
            ]),
            ...(r.conclusion ? ["Conclusion : " + r.conclusion] : []),
          ];
          return {
            title: r.title || e.filename,
            description: r.intro,
            bullets,
          };
        }),
      };
      return { report, perFile };
    }

    // merge mode with several documents: consolidation pass
    const corpus = extracted
      .map((e, i) => `--- DOCUMENT ${i + 1} (${e.filename}) ---\n${JSON.stringify(e.report)}`)
      .join("\n\n");

    const text = await callAI({
      model: PRO_MODEL,
      system:
        "Tu consolides plusieurs documents en un seul rapport professionnel en français, sans inventer de faits, sans doublons." +
        styleClause(data.style),
      json: true,
      messages: [
        {
          role: "user",
          content:
            "Fusionne ces documents en un rapport unique cohérent. Renvoie ce JSON exact, sans texte hors JSON :\n" +
            REPORT_JSON_SHAPE +
            "\n\nDOCUMENTS :\n" +
            corpus,
        },
      ],
    });
    return { report: extractedSchema.parse(parseJsonLoose(text)), perFile };
  });

// ----- Agent: documents en attente + consigne libre (fusion multi-rapports) -----

const agentFile = z.object({
  filename: z.string(),
  mimeType: z.string(),
  base64: z.string().min(10).max(MAX_BASE64_CHARS),
});

const agentInput = z.object({
  instruction: z.string().min(1).max(4000),
  files: z.array(agentFile).max(15).default([]),
  history: z.array(chatMsg).default([]),
  reportDraft: reportShape.optional(),
  style: z.string().optional(),
});

const agentReplySchema = z.object({
  reply: z.string().default(""),
  updatedDraft: extractedSchema.nullable().optional(),
  imagePlacements: z
    .array(
      z.object({
        imageIndex: z.number().int(),
        sectionIndex: z.number().int().nullable().default(null),
        caption: z.string().default(""),
      }),
    )
    .default([]),
});

export type AgentImage = {
  id: number;
  source: string;
  mimeType: string;
  base64: string;
};

export type AgentReply = {
  reply: string;
  updatedDraft: ExtractedReport | null;
  images: (AgentImage & { sectionIndex: number | null; caption: string })[];
};

export const aiAgentProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => agentInput.parse(d))
  .handler(async ({ data }): Promise<AgentReply> => {
    const content: any[] = [];
    const images: AgentImage[] = [];
    const docLines: string[] = [];

    for (const f of data.files) {
      const lower = f.filename.toLowerCase();
      if (f.mimeType.startsWith("image/")) {
        const id = images.length;
        images.push({ id, source: f.filename, mimeType: f.mimeType, base64: f.base64 });
        docLines.push(`- IMAGE #${id} : photo jointe « ${f.filename} »`);
        content.push({ type: "text", text: `IMAGE #${id} (${f.filename}) :` });
        content.push({ type: "image_url", image_url: { url: `data:${f.mimeType};base64,${f.base64}` } });
      } else if (lower.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const buffer = Buffer.from(f.base64, "base64");
        const { value: rawText } = await mammoth.extractRawText({ buffer });
        // Extraire les vraies images intégrées au document Word
        const embedded: AgentImage[] = [];
        await mammoth.convertToHtml(
          { buffer },
          {
            convertImage: mammoth.images.imgElement(async (image: any) => {
              const b64 = await image.read("base64");
              if (embedded.length < 20 && b64.length > 2000) {
                embedded.push({
                  id: images.length + embedded.length,
                  source: f.filename,
                  mimeType: image.contentType || "image/png",
                  base64: b64,
                });
              }
              return { src: "" };
            }),
          },
        );
        images.push(...embedded);
        docLines.push(
          `- DOCUMENT WORD « ${f.filename} »` +
            (embedded.length ? ` (images intégrées : ${embedded.map((e) => "#" + e.id).join(", ")})` : ""),
        );
        content.push({
          type: "text",
          text: `CONTENU DU DOCUMENT « ${f.filename} » :\n${rawText.slice(0, 30_000)}`,
        });
      } else if (f.mimeType === "application/pdf" || lower.endsWith(".pdf")) {
        docLines.push(`- DOCUMENT PDF « ${f.filename} »`);
        content.push({ type: "text", text: `DOCUMENT PDF « ${f.filename} » :` });
        content.push({
          type: "file",
          file: { filename: f.filename, file_data: `data:application/pdf;base64,${f.base64}` },
        });
      }
    }

    const system =
      "Tu es un agent de rédaction de rapports professionnels en français. L'utilisateur t'a transmis des documents et te donne une consigne : exécute EXACTEMENT cette consigne (fusion de plusieurs rapports en un seul, synthèse, extraction, reformulation…). " +
      "Pour une fusion : un seul rapport cohérent, sans doublons, faits regroupés par thème, aucun fait inventé. " +
      "Style note administrative fluide : n'écris JAMAIS de titres 'Introduction', 'Développement' ou 'Conclusion'. " +
      "Les images numérotées (#n) sont de VRAIES photos qui seront insérées dans le rapport : indique pour chaque image utile la section (index 0-based dans updatedDraft.sections, ou null pour la galerie générale) et une légende courte. Ignore logos/icônes décoratifs. " +
      "Réponds STRICTEMENT en JSON : " +
      '{"reply": "résumé markdown de ce que tu as fait", "updatedDraft": null | ' +
      REPORT_JSON_SHAPE +
      ', "imagePlacements": [{"imageIndex": number, "sectionIndex": number | null, "caption": string}]}. ' +
      "updatedDraft = rapport COMPLET final, ou null si la consigne est une simple question. Si le brouillon actuel n'est pas vide et que la consigne n'est pas une fusion/réécriture explicite, intègre les documents EN AJOUT au contenu existant." +
      EDIT_RULES +
      styleClause(data.style);

    const messages: AIMessage[] = [];
    messages.push(...historyAsContext(data.history.slice(-16)));
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Brouillon actuel du rapport :\n" +
            JSON.stringify(data.reportDraft ?? null) +
            "\n\nDocuments joints :\n" +
            (docLines.join("\n") || "aucun"),
        },
        ...content,
        { type: "text", text: "CONSIGNE DE L'UTILISATEUR :\n" + data.instruction },
      ],
    });

    const text = await callAI({ model: PRO_MODEL, system, json: true, messages });
    const parsed = agentReplySchema.parse(parseJsonLoose(text));
    const sectionsCount = parsed.updatedDraft?.sections.length ?? 0;
    const used = new Set<number>();
    const placed = parsed.imagePlacements
      .filter((p) => images[p.imageIndex] && !used.has(p.imageIndex) && used.add(p.imageIndex))
      .map((p) => ({
        ...images[p.imageIndex]!,
        sectionIndex:
          p.sectionIndex !== null && p.sectionIndex >= 0 && p.sectionIndex < sectionsCount
            ? p.sectionIndex
            : null,
        caption: p.caption,
      }));
    // Les photos jointes directement sont toujours conservées
    for (const img of images) {
      if (!used.has(img.id) && img.source && data.files.some((f) => f.filename === img.source && f.mimeType.startsWith("image/"))) {
        placed.push({ ...img, sectionIndex: null, caption: "" });
      }
    }
    return { reply: parsed.reply, updatedDraft: parsed.updatedDraft ?? null, images: placed };
  });
