import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { CalendarDays, FileText, Loader2, Plus } from "lucide-react";
import { listPlanDocuments, type PlanDocument } from "@/lib/planning/plan-documents.functions";

export const Route = createFileRoute("/_authenticated/planning")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      {
        name: "description",
        content: "Rédigez, partagez et imprimez le document qui décrit ce qui va se passer.",
      },
      { property: "og:title", content: "Planning — DailyBrief" },
      { property: "og:description", content: "Le document de prévision, période par période." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningListPage,
});

const fr = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function PlanningListPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listPlanDocuments);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["plan-documents"],
    queryFn: () => listFn(),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            Planning
          </h1>
          <p className="text-sm text-muted-foreground">
            Le document qui décrit ce qui va se passer pendant une période.
          </p>
        </div>
        <Button
          className="ml-auto"
          size="sm"
          onClick={() => navigate({ to: "/planning/$id/edit", params: { id: "new" } })}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau planning
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Aucun planning rédigé</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crée le premier : décris la période, l'assistant rédige, tu partages ou tu imprimes.
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => navigate({ to: "/planning/$id/edit", params: { id: "new" } })}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau planning
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: PlanDocument) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => navigate({ to: `/planning/${doc.id}` })}
              className="block w-full rounded-lg border bg-card px-4 py-3 text-left transition hover:bg-muted/50"
            >
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {fr(doc.period_start)} → {fr(doc.period_end)}
                </span>
              </div>
              {doc.intro && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {doc.intro}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {doc.sections.length} section{doc.sections.length > 1 ? "s" : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
