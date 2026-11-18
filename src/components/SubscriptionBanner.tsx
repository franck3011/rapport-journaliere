import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Clock } from "lucide-react";
import { getSubscriptionState } from "@/lib/subscription.functions";
import { Button } from "@/components/ui/button";

/**
 * Bandeau d'abonnement : rappelle l'essai en cours, et signale son expiration.
 * Visible par tous les membres, mais seul le propriétaire peut agir.
 */
export function SubscriptionBanner() {
  const fn = useServerFn(getSubscriptionState);
  const { data } = useQuery({
    queryKey: ["subscription-state"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });

  if (!data || data.status === "none" || data.status === "active") return null;

  if (data.status === "trial") {
    // On ne dérange qu'à partir de J-5.
    if (data.daysLeft > 5) return null;
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
        <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Essai gratuit : <strong>{data.daysLeft} jour{data.daysLeft > 1 ? "s" : ""} restant{data.daysLeft > 1 ? "s" : ""}</strong>.
        </span>
        {data.isOwner ? (
          <Button asChild size="sm" variant="outline" className="ml-auto h-7">
            <Link to="/plans">Choisir une formule</Link>
          </Button>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            Le dirigeant peut activer l'abonnement.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span>
        <strong>Votre essai est terminé.</strong> Activez une formule pour continuer à utiliser DailyBrief.
      </span>
      {data.isOwner ? (
        <Button asChild size="sm" className="ml-auto h-7">
          <Link to="/plans">Activer maintenant</Link>
        </Button>
      ) : (
        <span className="ml-auto text-xs text-muted-foreground">
          Le dirigeant doit activer l'abonnement.
        </span>
      )}
    </div>
  );
}
