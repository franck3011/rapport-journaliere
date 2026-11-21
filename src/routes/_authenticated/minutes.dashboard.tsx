import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMinutesStats } from "@/lib/minutes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSignature, ArrowLeft, TrendingUp, Users, FileText } from "lucide-react";
import { format, parse } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/minutes/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord PV — DailyBrief" },
      { name: "description", content: "Statistiques des procès-verbaux." },
    ],
  }),
  component: MinutesDashboardPage,
});

function MinutesDashboardPage() {
  const statsFn = useServerFn(getMinutesStats);
  const q = useQuery({
    queryKey: ["minutes", "stats"],
    queryFn: () => statsFn(),
  });

  const stats = q.data;
  const maxMonthly = stats
    ? Math.max(1, ...stats.monthly.map((m) => m.count))
    : 1;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-3">
          <Link to="/minutes">
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour aux PV
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <FileSignature className="h-7 w-7 text-primary" />
          Tableau de bord — Procès-verbaux
        </h1>
        <p className="text-muted-foreground mt-1">
          Vue synthétique de l'activité PV.
        </p>
      </div>

      {q.isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard
              label="Total des PV"
              value={stats.total}
              icon={<FileSignature className="h-5 w-5 text-primary" />}
            />
            <StatCard
              label="Ce mois-ci"
              value={stats.thisMonth}
              icon={<TrendingUp className="h-5 w-5 text-primary" />}
            />
            <StatCard
              label="Rapports avec PV"
              value={stats.reportsWithMinutes}
              icon={<FileText className="h-5 w-5 text-primary" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Évolution — 6 derniers mois
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.monthly.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune donnée.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stats.monthly.map((m) => {
                      const d = parse(m.month, "yyyy-MM", new Date());
                      const label = format(d, "LLLL yyyy", { locale: fr });
                      const pct = (m.count / maxMonthly) * 100;
                      return (
                        <div key={m.month}>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span className="capitalize">{label}</span>
                            <span>{m.count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Par auteur
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byAuthor.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune donnée.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stats.byAuthor.slice(0, 10).map((a) => (
                      <div
                        key={a.authorId}
                        className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0"
                      >
                        <span className="truncate">{a.authorName}</span>
                        <span className="font-semibold tabular-nums">
                          {a.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
