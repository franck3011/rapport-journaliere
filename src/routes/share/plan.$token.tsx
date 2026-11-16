import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSharedPlan } from "@/lib/planning/plan-documents.functions";
import { PlanDocumentView } from "@/components/planning/PlanDocumentView";
import { printNarrative } from "@/components/planning/PlanDocumentDialog";

export const Route = createFileRoute("/share/plan/$token")({
  head: () => ({
    meta: [
      { title: "Planning partagé — DailyBrief" },
      { name: "description", content: "Document de prévision partagé en lecture seule." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedPlanPage,
});

const fr = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function SharedPlanPage() {
  const { token } = useParams({ from: "/share/plan/$token" });
  const getFn = useServerFn(getSharedPlan);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["shared-plan", token],
    queryFn: () => getFn({ data: { token } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <FileText className="mx-auto h-9 w-9 text-muted-foreground/60" />
        <p className="mt-4 text-sm font-medium">Ce lien n'est plus valable</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Il a expiré ou a été révoqué par son auteur.
        </p>
      </div>
    );
  }

  const periodLabel = `Période du ${fr(plan.period_start)} au ${fr(plan.period_end)}`;

  return (
    <div className="min-h-dvh bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Document partagé · {plan.company_name}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              printNarrative(
                {
                  title: plan.title,
                  intro: plan.intro,
                  conclusion: plan.conclusion,
                  sections: plan.sections,
                },
                periodLabel,
              )
            }
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimer
          </Button>
        </div>

        <PlanDocumentView
          title={plan.title}
          intro={plan.intro}
          conclusion={plan.conclusion}
          sections={plan.sections}
          periodLabel={periodLabel}
          companyName={plan.company_name}
        />

        <p className="text-center text-[11px] text-muted-foreground">
          Document généré avec DailyBrief — lecture seule.
        </p>
      </div>
    </div>
  );
}
