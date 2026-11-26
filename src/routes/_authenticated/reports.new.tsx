import { createFileRoute, useSearch } from "@tanstack/react-router";
import { ReportForm } from "@/components/ReportForm";
import { BudgetForm } from "@/components/budget/BudgetForm";
import type { DocType } from "@/lib/budget";

export const Route = createFileRoute("/_authenticated/reports/new")({
  validateSearch: (search: Record<string, unknown>): { type?: DocType; titre?: string; date?: string } => ({
    type: typeof search.type === "string" ? (search.type as DocType) : undefined,
  titre: typeof search.titre === "string" ? search.titre : undefined,
  date: typeof search.date === "string" ? search.date : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Nouveau rapport — DailyBrief" },
      {
        name: "description",
        content: "Créez un rapport journalier ou une fiche de budget détaillée dans DailyBrief.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewDocumentPage,
});

function NewDocumentPage() {
  const { type, titre, date } = useSearch({ from: "/_authenticated/reports/new" });
  if (type === "budget") return <BudgetForm />;
  return <ReportForm prefillTitle={titre} prefillDate={date} />;
}
