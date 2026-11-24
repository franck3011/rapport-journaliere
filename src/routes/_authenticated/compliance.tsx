import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Gauge, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { ComplianceSettingsCard } from "@/components/compliance/ComplianceSettingsCard";
import { ChartBlockView } from "@/components/reports/ChartBlockView";
import { downloadComplianceAttestation } from "@/lib/compliance/attestation";
import {
  getLatestComplianceScore,
  listComplianceHistory,
  recalculateComplianceScore,
} from "@/lib/compliance/compliance.functions";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({
    meta: [
      { title: "Score de conformité — DailyBrief" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompliancePage,
});

type CriteriaDetail = {
  value: number;
  weight: number;
  points: number;
  numerator: number;
  denominator: number;
};

const CRITERIA: { key: string; label: string; hint: string }[] = [
  { key: "punctuality", label: "Ponctualité", hint: "rapports déposés à temps" },
  { key: "completeness", label: "Complétude", hint: "rapports complets" },
  { key: "incidents", label: "Incidents clôturés", hint: "actions closes dans le délai" },
  { key: "regularity", label: "Régularité", hint: "jours couverts par un rapport" },
];

function scoreTone(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function CompliancePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getLatestComplianceScore);
  const recalcFn = useServerFn(recalculateComplianceScore);
  const historyFn = useServerFn(listComplianceHistory);

  const { data, isLoading } = useQuery({
    queryKey: ["compliance-score"],
    queryFn: () => getFn(),
  });

  const { data: history } = useQuery({
    queryKey: ["compliance-history"],
    queryFn: () => historyFn(),
  });

  const recalc = useMutation({
    mutationFn: () => recalcFn({ data: {} }),
    onSuccess: async (result: any) => {
      if (result?.status === "insufficient") {
        toast.warning(
          `Pas assez de données : ${result.measurable} action(s) mesurable(s), ${result.required} requises.`,
        );
        return;
      }
      if (result?.status === "cooldown") {
        toast.info("Un score a déjà été calculé il y a moins d'une heure.");
        return;
      }
      toast.success(`Score calculé : ${result.score} / 100`);
      await qc.invalidateQueries({ queryKey: ["compliance-score"] });
      await qc.invalidateQueries({ queryKey: ["compliance-history"] });
    },
    onError: (error: any) =>
      toast.error(error?.message ?? "Recalcul impossible"),
  });

  const details: any = data?.details ?? null;
  const score = Number(data?.score ?? 0);
  const measurable = Number(details?.measurable_actions ?? 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Gauge className="h-5 w-5 text-primary" />
            Score de conformité
          </h1>
          <p className="text-sm text-muted-foreground">
            Calculé à partir des données réelles de l'entreprise, jamais saisi à la main.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button onClick={() => recalc.mutate()} disabled={recalc.isPending}>
          {recalc.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Recalculer
        </Button>
        {details && (
          <Button
            variant="outline"
            onClick={() =>
              void downloadComplianceAttestation({
                companyName: (data as any)?.companyName ?? "Entreprise",
                score,
                periodStart: details.period?.start ?? "",
                periodEnd: details.period?.end ?? "",
                calculatedAt: String(data?.calculated_at ?? new Date().toISOString()),
                details,
                verifyCode: (data as any)?.verify_code ?? null,
              })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Attestation PDF
          </Button>
        )}
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      )}

      {!isLoading && !details && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun score calculé pour le moment. Lancez le premier calcul.
            </p>
          </CardContent>
        </Card>
      )}

      {details && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 p-6">
              <div>
                <p className={`text-5xl font-semibold tabular-nums ${scoreTone(score)}`}>
                  {score.toFixed(1)}
                  <span className="ml-1 text-lg font-normal text-muted-foreground">/ 100</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Du {details.period?.start} au {details.period?.end}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>{details.reports_count ?? 0} rapport(s) sur la période</p>
                <p>{measurable} action(s) mesurable(s)</p>
                {Number(details.excluded_actions ?? 0) > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    {details.excluded_actions} action(s) terminée(s) sans date, écartée(s)
                  </p>
                )}
                {Number(details.excluded_cancelled ?? 0) > 0 && (
                  <p className="mt-1 text-xs">
                    {details.excluded_cancelled} action(s) annulée(s), hors calcul
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {CRITERIA.map((criterion) => {
              const detail = details[criterion.key] as CriteriaDetail | undefined;
              if (!detail) return null;
              const width = Math.max(0, Math.min(100, detail.value));
              return (
                <Card key={criterion.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{criterion.label}</CardTitle>
                    <CardDescription className="text-xs">{criterion.hint}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-semibold tabular-nums">
                        {detail.value.toFixed(1)} %
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {detail.points.toFixed(1)} / {detail.weight} pts
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {detail.numerator} sur {detail.denominator}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {Array.isArray(history) && history.length >= 2 && (
            <ChartBlockView
              block={{
                type: "chart",
                kind: "line",
                title: "Évolution du score",
                data: history.map((row: any) => ({
                  label: String(row.period_end).slice(5),
                  value: Number(row.score),
                })),
              }}
            />
          )}

          <ComplianceSettingsCard />

          {data?.calculated_at && (
            <p className="text-xs text-muted-foreground">
              Dernier calcul : {new Date(data.calculated_at).toLocaleString("fr-FR")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
