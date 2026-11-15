import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyModules } from "@/lib/modules.functions";
import { launcherModules } from "@/lib/modules/registry";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { LayoutGrid, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/apps")({
  head: () => ({
    meta: [
      { title: "Mes applications — DailyBrief" },
      {
        name: "description",
        content:
          "Lanceur d'applications DailyBrief : rapports, procès-verbaux, tâches, entreprise et plans.",
      },
    ],
  }),
  component: AppsLauncher,
});

function AppsLauncher() {
  const modulesFn = useServerFn(getMyModules);
  const { data: state } = useQuery({
    queryKey: ["my-modules"],
    queryFn: () => modulesFn(),
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");

  const modules = useMemo(() => {
    const list = launcherModules(state?.disabled, state?.planRank);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) ||
        m.description.toLowerCase().includes(needle),
    );
  }, [state?.disabled, q]);

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
      <header className="grid grid-cols-1 gap-4 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex min-w-0 items-center gap-2">
            <LayoutGrid className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">Mes applications</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Ouvrez une application ou activez-en de nouvelles.
          </p>
        </div>
        {state?.isOwner && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/company/applications">
              <Settings2 className="mr-2 h-4 w-4" />
              Gérer les applications
            </Link>
          </Button>
        )}
      </header>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher une application…"
        aria-label="Rechercher une application"
        className="max-w-sm"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.code}
              to={m.entry}
              className="group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div
                className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg ${m.tone}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-semibold truncate">{m.name}</div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {m.description}
              </p>
            </Link>
          );
        })}
      </div>

      {modules.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune application trouvée.</p>
      )}
    </div>
  );
}
