import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron quotidien : relances des actions.
 * Protégé par un secret serveur (CRON_SECRET de Vercel, ou MAIL_DISPATCH_SECRET).
 */
async function handle(request: Request) {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  const expected =
    process.env["CRON_SECRET"] ?? process.env["MAIL_DISPATCH_SECRET"] ?? "";

  if (!expected || expected.length < 16 || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { sendActionReminders } = await import("@/lib/actions/reminders.server");
    const result = await sendActionReminders();
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("[actions] relances", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/actions/reminders")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
