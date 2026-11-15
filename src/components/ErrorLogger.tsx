import { useEffect } from "react";

/**
 * Capte les erreurs non gérées du navigateur et les enregistre en base.
 * Sert de substitut à Sentry tant qu'aucun compte externe n'est branché :
 * les erreurs restent dans tes données, consultables depuis l'admin.
 *
 * Garde-fous :
 *  - une même erreur n'est envoyée qu'une fois par session ;
 *  - au plus 20 envois par session ;
 *  - un échec d'envoi est ignoré silencieusement.
 */
export function ErrorLogger() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;

    async function report(message: string, stack?: string) {
      const key = `${message}|${stack?.slice(0, 120) ?? ""}`;
      if (seen.has(key) || sent >= 20) return;
      seen.add(key);
      sent++;

      try {
        const { logClientError } = await import("@/lib/errors.functions");
        await logClientError({
          data: {
            message: message.slice(0, 2000),
            stack: stack?.slice(0, 8000),
            path: window.location.pathname,
            context: { userAgent: navigator.userAgent },
          },
        });
      } catch {
        // Le suivi d'erreurs ne doit jamais casser l'application.
      }
    }

    function onError(event: ErrorEvent) {
      void report(event.message || "Erreur inconnue", event.error?.stack);
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : (reason?.message ?? "Promesse rejetée sans message");
      void report(message, reason?.stack);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
