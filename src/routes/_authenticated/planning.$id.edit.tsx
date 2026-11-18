import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReport } from "@/lib/reports.functions";
import { ReportForm } from "@/components/ReportForm";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/planning/$id/edit")({
  head: () => ({
    meta: [
      { title: "Modifier le planning — DailyBrief" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditPlanPage,
});

function EditPlanPage() {
  const { id } = Route.useParams();
  const fetchOne = useServerFn(getReport);
  const q = useQuery({ queryKey: ["report", id], queryFn: () => fetchOne({ data: { id } }) });

  if (q.isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 text-center text-muted-foreground">
        Planning introuvable.
      </div>
    );
  }

  return <ReportForm initial={q.data} />;
}
