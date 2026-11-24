import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { getPublicCompliance } from "@/lib/compliance/public.functions";

export const Route = createFileRoute("/verifier/$code")({
  head: () => ({
    meta: [
      { title: "Vérification d'attestation — DailyBrief" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { code } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["verify", code],
    queryFn: () => getPublicCompliance({ data: { code } }),
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <h1 className="mb-1 text-xl font-semibold">Vérification d'attestation</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Référence contrôlée : <span className="font-mono">{code}</span>
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche…
        </div>
      )}

      {!isLoading && !data?.found && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <ShieldX className="h-5 w-5" />
            Aucune attestation ne correspond à cette référence.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Le document est peut-être périmé, ou la référence a été mal recopiée.
          </p>
        </div>
      )}

      {!isLoading && data?.found && (
        <div className="rounded-lg border p-5">
          <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            Attestation authentique
          </p>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Entreprise</dt>
              <dd className="font-medium">{data.company_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Période</dt>
              <dd>
                {data.period_start} → {data.period_end}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Score</dt>
              <dd className="text-lg font-semibold">{Number(data.score).toFixed(1)} / 100</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Calculé le</dt>
              <dd>{new Date(String(data.calculated_at)).toLocaleString("fr-FR")}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
