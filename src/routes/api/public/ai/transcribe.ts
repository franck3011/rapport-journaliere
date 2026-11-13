import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Transcription audio — Google Gemini (generateContent avec audio inline).
// Découplé de Lovable : seule GEMINI_API_KEY est nécessaire.

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
// gemini-2.5-flash n'est plus ouvert aux nouveaux comptes (404) ; on essaie la
// chaîne suivante dans l'ordre jusqu'à obtenir une transcription.
const TRANSCRIBE_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash"];

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/ai/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- AuthN: require a valid Supabase Bearer token ---
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonError(401, "Authentification requise");
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token || token.split(".").length !== 3) {
          return jsonError(401, "Jeton invalide");
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return jsonError(500, "Configuration backend manquante");
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        const { data: claimsData, error: claimsError } =
          await supabase.auth.getClaims(token);
        if (claimsError || !claimsData?.claims?.sub) {
          return jsonError(401, "Session invalide ou expirée");
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return jsonError(500, "Configuration IA manquante (GEMINI_API_KEY)");
        }

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return jsonError(400, "Fichier audio manquant");
        }
        if (file.size > MAX_AUDIO_BYTES) {
          return jsonError(413, "Fichier audio trop volumineux (max 10 Mo)");
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString("base64");

        let text = "";
        let lastError = "";
        for (const model of TRANSCRIBE_MODELS) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: "Transcris fidèlement cet enregistrement audio en français. Réponds uniquement par la transcription, sans commentaire.",
                      },
                      {
                        inline_data: {
                          mime_type: file.type || "audio/wav",
                          data: base64,
                        },
                      },
                    ],
                  },
                ],
              }),
            },
          );

          if (!res.ok) {
            lastError = `HTTP ${res.status}`;
            if (res.status === 429) {
              return jsonError(429, "Limite de requêtes IA atteinte. Réessayez dans un instant.");
            }
            continue;
          }

          const json = (await res.json()) as any;
          const parts = json?.candidates?.[0]?.content?.parts ?? [];
          text = parts
            .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
            .join("")
            .trim();
          if (text) break;
        }

        if (!text) {
          return jsonError(502, `Transcription impossible (${lastError || "réponse vide"})`);
        }

        return new Response(JSON.stringify({ text }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
