import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Building2, FileText, Loader2, Users } from "lucide-react";
import { getUsageMetrics } from "@/lib/usage.functions";

export const Route = createFileRoute("/_authenticated/usage")({
  head: () => ({
    meta: [{ title: "Usage — DailyBrief" }, { name: "robots", content: "noindex" }],
  }),
  component: UsagePage,
});

function UsagePage() {
  const fn = useServerFn(getUsageMetrics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["usage-metrics"],
    queryFn: () => fn(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calcul des indicateurs…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center text-sm text-muted-foreground">
        {(error as Error)?.message ?? "Indicateurs indisponibles."}
      </div>
    );
  }

  const tiles = [
    { label: "Entreprises", value: data.companies, icon: Building2 },
    { label: "Membres", value: data.users, icon: Users },
    { label: "Rapports (7 jours)", value: data.reports7d, icon: FileText },
    { label: "Essais à J-5", value: data.trialsEnding, icon: BarChart3 },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <BarChart3 className="h-5 w-5 text-primary" />
          Usage de la plateforme
        </h1>
        <p className="text-sm text-muted-foreground">
          Les chiffres qui disent si le produit est réellement utilisé.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-5">
              <tile.icon className="h-4 w-4 text-muted-foreground" />
              <p className="mt-2 text-3xl font-semibold tabular-nums">{tile.value}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-semibold">Répartition par formule</p>
          <div className="mt-3 space-y-2">
            {data.plans.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune entreprise enregistrée.</p>
            )}
            {data.plans.map((plan) => (
              <div key={plan.name} className="flex items-center justify-between text-sm">
                <span>{plan.name}</span>
                <span className="font-medium tabular-nums">{plan.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-3xl font-semibold tabular-nums">{data.reportsTotal}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Rapports au total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p
              className={`text-3xl font-semibold tabular-nums ${
                data.errors24h > 0 ? "text-destructive" : "text-emerald-600"
              }`}
            >
              {data.errors24h}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Erreurs sur 24 h
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
