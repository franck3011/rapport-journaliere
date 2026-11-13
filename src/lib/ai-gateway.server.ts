// Server-only AI helper — Google Gemini via son endpoint compatible OpenAI.
//
// HISTORIQUE : ce fichier utilisait d'abord le Lovable AI Gateway
// (ai.gateway.lovable.dev + LOVABLE_API_KEY). Il a été découplé pour permettre
// un déploiement hors Lovable. Seule variable requise : GEMINI_API_KEY
// (clé gratuite sur https://aistudio.google.com/apikey).

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

export const DEFAULT_MODEL = "google/gemini-3.5-flash";
export const PRO_MODEL = "google/gemini-3.1-pro-preview";

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image_url"; image_url: { url: string } };
type FileContent = {
  type: "file";
  file: { filename: string; file_data: string };
};

export type AIContent = TextContent | ImageContent | FileContent;

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string | AIContent[];
};

export type AICallOpts = {
  model?: string;
  system?: string;
  messages: AIMessage[];
  json?: boolean;
  temperature?: number;
};

function geminiModel(m?: string): string {
  const name = (m ?? DEFAULT_MODEL).replace(/^google\//, "");
  return name.includes("pro") ? "gemini-3.1-pro-preview" : "gemini-3.5-flash";
}

function geminiChain(m?: string): string[] {
  const first = geminiModel(m);
  const rest = first.includes("pro")
    ? ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
    : ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
  return [first, ...rest];
}

async function callGemini(opts: AICallOpts, key: string): Promise<string> {
  const messages: AIMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  for (const m of opts.messages) {
    if (typeof m.content === "string") {
      messages.push(m);
      continue;
    }
    messages.push({
      role: m.role,
      content: m.content.map((c) =>
        c.type === "file"
          ? ({ type: "image_url", image_url: { url: c.file.file_data } } as ImageContent)
          : c,
      ),
    });
  }

  const body: Record<string, unknown> = {
    model: geminiModel(opts.model),
    messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let last = "";
  for (const model of geminiChain(opts.model)) {
    body.model = model;
    const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    }).catch((e) => {
      last = String((e as Error).message);
      return null;
    });
    if (!res) continue;
    if (res.ok) {
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return json.choices?.[0]?.message?.content ?? "";
    }
    last = `${res.status} ${(await res.text().catch(() => "")).slice(0, 240)}`;
    if (res.status === 429) {
      last = "Limite de requêtes Gemini atteinte. Réessayez dans un instant.";
    }
    if (![404, 408, 429, 500, 502, 503, 504].includes(res.status)) break;
  }
  throw new Error(`Gemini a échoué (${last})`);
}

export async function callAI(opts: AICallOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY manquant côté serveur. Créez une clé sur https://aistudio.google.com/apikey et ajoutez-la aux variables d'environnement.",
    );
  }
  return callGemini(opts, key);
}

export function parseJsonLoose<T>(text: string): T {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("Réponse IA invalide (JSON introuvable)");
    return JSON.parse(s.slice(first, last + 1)) as T;
  }
}
