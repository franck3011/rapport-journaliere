import { createFileRoute } from "@tanstack/react-router";
import { ReportDetailPage } from "./reports.$id.index";

export const Route = createFileRoute("/_authenticated/planning/$id")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      { name: "description", content: "Document de prévision d'une période." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlanningDetailRoute,
});

/**
 * Un planning est un rapport de type « plan » : on réutilise donc la même vue,
 * avec ses boutons (PDF, partage, WhatsApp, e-mail, modifier, supprimer), mais
 * sous l'adresse du module Planning.
 */
function PlanningDetailRoute() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  return <ReportDetailPage id={id} user={user} />;
}
