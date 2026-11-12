import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Synthèse vocale — Google Gemini (modèle TTS).
// Découplé de Lovable : seule GEMINI_API_KEY est nécessaire.
// Gemini renvoie du PCM brut (L16, 24 kHz, mono) : on l'emballe dans un
// conteneur WAV pour que le navigateur puisse le lire nativement.

const MAX_TEXT_LEN = 4000;
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE = 24000;

/** Voix legacy (celles exposées par l'ancien gateway) → voix Gemini. */
const VOICE_MAP: Record<string, string> = {
  alloy: "Kore",
  echo: "Puck",
  fable: "Charon",
  onyx: "Fenrir",
  nova: "Aoede",
  shimmer: "Leda",
};

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });

/** En-tête WAV (RIFF) pour du PCM 16 bits mono. */
function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const Route = createFileRoute("/api/public/ai/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        let body: { text?: string; voice?: string };
        try {
          body = (await request.json()) as { text?: string; voice?: string };
        } catch {
          return jsonError(400, "Corps JSON invalide");
        }
        const rawText = (body.text ?? "").trim();
        if (!rawText) return jsonError(400, "Texte manquant");
        // Strip markdown noise so the model doesn't literally read "asterisk" etc.
        const cleaned = rawText
          .replace(/```[\s\S]*?```/g, "")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/[*_#>]+/g, " ")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_TEXT_LEN);
        if (!cleaned) return jsonError(400, "Texte vide après nettoyage");

        const voiceName = VOICE_MAP[String(body.voice ?? "alloy")] ?? "Kore";

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: cleaned }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                },
              },
            }),
          },
        );

        if (!res.ok) {
          return jsonError(
            res.status === 429 ? 429 : 502,
            res.status === 429
              ? "Limite de requêtes IA atteinte. Réessayez dans un instant."
              : `Synthèse vocale impossible (${res.status})`,
          );
        }

        const json = (await res.json()) as any;
        const b64 = json?.candidates?.[0]?.content?.parts?.find(
          (p: any) => p?.inlineData?.data ?? p?.inline_data?.data,
        );
        const pcmB64: string | undefined = b64?.inlineData?.data ?? b64?.inline_data?.data;
        if (!pcmB64) return jsonError(502, "Réponse audio invalide");

        const wav = pcmToWav(Buffer.from(pcmB64, "base64"));

        return new Response(new Uint8Array(wav), {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
