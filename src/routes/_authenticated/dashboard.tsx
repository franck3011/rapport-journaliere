import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  FileText,
  ListChecks,
  CalendarCheck2,
  Receipt,
  FolderOpen,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { getDashboardSummary } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — DailyBrief" },
      {
        name: "description",
        content:
          "Vue consolidée de vos rapports, tâches, congés, notes de frais et documents.",
      },
      { property: "og:title", content: "Tableau de bord — DailyBrief" },
      {
        property: "og:description",
        content: "Tous vos indicateurs d'activité sur un seul écran.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

/** Écart avec la période précédente, exprimé simplement. */
function comparisonHint(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? "aucun le mois dernier" : "aucun le mois dernier non plus";
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `stable vs mois dernier (${previous})`;
  return `${pct > 0 ? "+" : ""}${pct} % vs mois dernier (${previous})`;
}

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  to,
  tone = "text-primary",
}: {  label: string;
  value: string | number;
  hint?: string;
  icon: typeof FileText;
  to: string;
  tone?: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardContent className="space-y-1 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Icon className={`h-5 w-5 ${tone}`} />
          </div>
          <p className="text-2xl font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function DashboardPage() {
  const fn = useServerFn(getDashboardSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => fn(),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <BarChart3 className="h-6 w-6 text-primary" />
            Tableau de bord
          </h1>
          <p className="text-sm text-muted-foreground">
            {data?.companyName
              ? `Activité de ${data.companyName}`
              : "Votre activité en un coup d'œil"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/apps">Toutes les applications</Link>
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-14 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Rapports ce mois"
              value={data?.reportsThisMonth ?? 0}
              hint={comparisonHint(data?.reportsThisMonth ?? 0, data?.reportsPrevMonth ?? 0)}
              icon={FileText}
              to="/reports"
            />
            <Tile
              label="Mes actions ouvertes"
              value={data?.actionsOpen ?? 0}
              hint={`${data?.actionsLate ?? 0} en retard`}
              icon={ListChecks}
              tone="text-emerald-500"
              to="/actions"
            />
            <Tile
              label="En attente de ma validation"
              value={data?.reportsToApprove ?? 0}
              hint="Rapports à valider"
              icon={AlertTriangle}
              tone="text-amber-500"
              to="/reports/equipe"
            />
            <Tile
              label="Mes tâches ouvertes"
              value={data?.tasksOpen ?? 0}
              hint={`${data?.tasksOverdue ?? 0} en retard`}
              icon={ListChecks}
              tone="text-emerald-500"
              to="/tasks"
            />
            <Tile
              label="Mes congés en cours"
              value={data?.leavesPending ?? 0}
              hint={`${data?.leavesToApprove ?? 0} à valider pour moi`}
              icon={CalendarCheck2}
              tone="text-teal-500"
              to="/leaves"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Notes de frais à valider"
              value={data?.expensesPending ?? 0}
              icon={Receipt}
              tone="text-orange-500"
              to="/expenses/validations"
            />
            <Tile
              label="Remboursements approuvés"
              value={new Intl.NumberFormat("fr-FR").format(
                data?.expensesApprovedAmount ?? 0,
              )}
              hint="Ce mois, en devise de saisie"
              icon={Receipt}
              tone="text-orange-500"
              to="/expenses"
            />
            <Tile
              label="Documents accessibles"
              value={data?.documentsCount ?? 0}
              icon={FolderOpen}
              tone="text-indigo-500"
              to="/documents"
            />
            <Tile
              label="Notifications non lues"
              value={data?.unreadNotifications ?? 0}
              icon={Bell}
              tone="text-rose-500"
              to="/apps"
            />
          </div>
        </>
      )}
    </div>
  );
}
