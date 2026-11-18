import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Enregistre le service worker et surveille les mises à jour.
 *
 * Le service worker met en cache les fichiers statiques (noms hachés) et les
 * pages déjà visitées, ce qui permet d'ouvrir l'application sans réseau.
 * Les pages restent servies par le réseau en priorité : une nouvelle version
 * est donc visible dès le rechargement, sans cache bloqué.
 */
export function ServiceWorkerSetup() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              toast("Nouvelle version disponible", {
                description: "Rechargez la page pour en profiter.",
                action: { label: "Recharger", onClick: () => window.location.reload() },
                duration: 12000,
              });
            }
          });
        });
      })
      .catch(() => {
        // L'absence de service worker ne doit jamais gêner l'application.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
