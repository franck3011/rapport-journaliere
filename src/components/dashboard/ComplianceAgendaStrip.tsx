import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Gauge, ArrowRight, Loader2 } from "lucide-react";
import { getLatestComplianceScore } from "@/lib/compliance/compliance.functions";
import { listAgenda } from "@/lib/agenda/agenda.functions";

/**
 * Bandeau du tableau de bord : le score de conformité et les prochaines
 * échéances. Deux modules récents qui, sinon, restent dans leur coin.
 */

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function scoreTone(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function ComplianceAgendaStrip() {
  const scoreFn = useServerFn(getLatestComplianceScore);
  const agendaFn = useServerFn(listAgenda);

  const today = new Date();
  const { data: score, isLoading: loadingScore } = useQuery({
    queryKey: ["compliance-score"],
    queryFn: () => scoreFn(),
    staleTime: 5 * 60_000,
  });

  const { data: agenda, isLoading: loadingAgenda } = useQuery({
    queryKey: ["agenda", "dashboard", isoDay(today)],
    queryFn: () =>
      agendaFn({ data: { from: isoDay(today), to: isoDay(new Date(today.getTime() + 7 * 86400000)) } }),
    staleTime: 5 * 60_000,
  });

  const next = ((agenda ?? []) as any[]).slice(0, 3);
  const value = Number((score as any)?.score ?? 0);
  const details: any = (score as any)?.details ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-primary" />
            Score de conformité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingScore ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : details ? (
            <>
              <p className={`text-3xl font-semibold tabular-nums ${scoreTone(value)}`}>
                {value.toFixed(1)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ 100</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {Number(details.punctuality?.value ?? 0).toFixed(0)} % de ponctualité ·{" "}
                {details.reports_count ?? 0} rapport(s)
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun score calculé.</p>
          )}
          <Button asChild size="sm" variant="ghost" className="px-0">
            <Link to="/compliance">
              Voir le détail <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            Les 7 prochains jours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {loadingAgenda ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : next.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien de prévu.</p>
          ) : (
            next.map((item) => (
              <div key={item.id} className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {String(item.date).slice(5)}
                </span>
                <span className="truncate">{item.title}</span>
              </div>
            ))
          )}
          <Button asChild size="sm" variant="ghost" className="px-0">
            <Link to="/agenda">
              Ouvrir l'agenda <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
