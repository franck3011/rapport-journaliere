import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { upsertReport } from "@/lib/reports.functions";
import { listQueued, removeQueued } from "@/lib/offline/queue";

/**
 * Renvoie les rapports mis en attente hors connexion.
 * Déclenché au chargement de l'application et au retour du réseau.
 */
export function OfflineFlush() {
  const upsert = useServerFn(upsertReport);

  useEffect(() => {
    let busy = false;

    async function flush() {
      if (busy || typeof navigator !== "undefined" && !navigator.onLine) return;
      const items = listQueued();
      if (items.length === 0) return;

      busy = true;
      let sent = 0;
      for (let index = items.length - 1; index >= 0; index--) {
        try {
          await upsert({ data: items[index].payload });
          removeQueued(index);
          sent++;
        } catch {
          // on garde l'élément en file pour une prochaine tentative
        }
      }
      busy = false;

      if (sent > 0) {
        toast.success(
          `${sent} rapport${sent > 1 ? "s" : ""} en attente ${sent > 1 ? "ont" : "a"} été envoyé${sent > 1 ? "s" : ""}.`,
        );
      }
    }

    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [upsert]);

  return null;
}
