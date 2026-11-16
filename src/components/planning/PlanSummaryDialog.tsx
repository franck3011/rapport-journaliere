import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Printer, Sparkles } from "lucide-react";
import {
  createPlanReportFromNarrative,
  createPlanReviewReport,
  generatePlanNarrative,
  listPlanItems,
  type PlanItem,
  type PlanNarrative,
} from "@/lib/planning/planning.functions";
import { summarizePlan, frDate } from "@/lib/planning/summary";

export function PlanSummaryDialog({
  open,
  onOpenChange,
  initialFrom,
  initialTo,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialFrom: string;
  initialTo: string;
}) {
  const navigate = useNavigate();
  const listFn = useServerFn(listPlanItems);
  const mechanicalFn = useServerFn(createPlanReviewReport);
  const generateFn = useServerFn(generatePlanNarrative);
  const createFromNarrativeFn = useServerFn(createPlanReportFromNarrative);

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [narrative, setNarrative] = useState<PlanNarrative | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom);
    setTo(initialTo);
    setNarrative(null);
  }, [open, initialFrom, initialTo]);

  const { data: items = [], isFetching } = useQuery({
    queryKey: ["plan-items-summary", from, to],
    queryFn: () => listFn({ data: { from, to } }),
    enabled: open && !!from && !!to && from <= to,
  });

  const today = new Date().toISOString().slice(0, 10);
  const summary = useMemo(() => summarizePlan(items as PlanItem[], today), [items, today]);

  function goToReport(id: string) {
    toast.success("Rapport créé");
    onOpenChange(false);
    setNarrative(null);
    navigate({ to: "/reports/$id/edit", params: { id } });
  }

  const mechanical = useMutation({
    mutationFn: () => mechanicalFn({ data: { from, to } }),
    onSuccess: ({ id }) => goToReport(id),
    onError: (e: any) => toast.error(e?.message ?? "Création impossible"),
  });

  const generate = useMutation({
    mutationFn: () => generateFn({ data: { from, to, mode: "bilan" } }),
    onSuccess: (result) => setNarrative(result),
    onError: (e: any) => toast.error(e?.message ?? "Génération impossible"),
  });

  const createFromNarrative = useMutation({
    mutationFn: () => createFromNarrativeFn({ data: { narrative: narrative! } }),
    onSuccess: ({ id }) => goToReport(id),
    onError: (e: any) => toast.error(e?.message ?? "Création impossible"),
  });

  const tone =
    summary.rate >= 80 ? "bg-emerald-500" : summary.rate >= 50 ? "bg-amber-500" : "bg-destructive";

  const busy = mechanical.isPending || generate.isPending || createFromNarrative.isPending;
  const validRange = !!from && !!to && from <= to;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setNarrative(null);
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {narrative ? "Aperçu du bilan" : "Bilan de la période"}
          </DialogTitle>
          <DialogDescription>
            Choisis les dates du bilan — elles sont indépendantes de la période affichée.
          </DialogDescription>
        </DialogHeader>

        {/* Sélection des dates */}
        {!narrative && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="space-y-1">
              <Label htmlFor="bilan-from" className="text-xs">Du</Label>
              <Input
                id="bilan-from"
                type="date"
                className="h-9 w-[150px]"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bilan-to" className="text-xs">Au</Label>
              <Input
                id="bilan-to"
                type="date"
                className="h-9 w-[150px]"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            {isFetching && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
            {!validRange && (
              <p className="mb-2 text-xs text-destructive">
                La date de fin doit suivre la date de début.
              </p>
            )}
          </div>
        )}

        {narrative ? (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            <h3 className="text-lg font-semibold leading-snug">{narrative.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {narrative.intro}
            </p>
            {narrative.sections.map((section, index) => (
              <div key={index} className="space-y-1.5">
                <h4 className="text-sm font-semibold">{section.title}</h4>
                {section.description && (
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                )}
                <ul className="space-y-1">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li
                      key={bulletIndex}
                      className="flex gap-2 text-sm leading-relaxed text-foreground/90"
                    >
                      <span className="text-muted-foreground">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {narrative.conclusion && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {narrative.conclusion}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums">{summary.rate} %</span>
                <span className="text-sm text-muted-foreground">d'avancement</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${tone}`}
                  style={{ width: `${summary.rate}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {summary.done} réalisé{summary.done > 1 ? "s" : ""} sur {summary.total} planifié
                {summary.total > 1 ? "s" : ""}
                {summary.cancelled > 0 ? ` · ${summary.cancelled} annulé(s)` : ""}
                {summary.total === 0 ? " — aucun travail sur ces dates" : ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Réalisés", value: summary.done, tone: "text-emerald-600 dark:text-emerald-400" },
                { label: "En cours", value: summary.inProgress, tone: "text-amber-600 dark:text-amber-400" },
                { label: "Prévus", value: summary.planned, tone: "text-muted-foreground" },
                { label: "En retard", value: summary.late.length, tone: "text-destructive" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border p-3">
                  <div className={`text-2xl font-semibold tabular-nums ${stat.tone}`}>
                    {stat.value}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {summary.late.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Travaux non réalisés dans les délais
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {summary.late.slice(0, 6).map((item) => (
                    <li key={item.id} className="truncate">
                      • {item.title} — {item.owner_name}
                    </li>
                  ))}
                  {summary.late.length > 6 && <li>… et {summary.late.length - 6} autre(s)</li>}
                </ul>
              </div>
            ) : (
              summary.total > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm">
                    Tous les travaux planifiés ont été menés dans les délais.
                  </p>
                </div>
              )
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {narrative ? (
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => setNarrative(null)}
                disabled={busy}
              >
                Retour
              </Button>
              <Button variant="outline" onClick={() => generate.mutate()} disabled={busy}>
                {generate.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Régénérer
              </Button>
              <Button onClick={() => createFromNarrative.mutate()} disabled={busy}>
                {createFromNarrative.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Créer le rapport
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="mr-auto text-muted-foreground"
                onClick={() => mechanical.mutate()}
                disabled={busy || summary.total === 0}
              >
                {mechanical.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Créer sans IA
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Fermer
              </Button>
              <Button
                onClick={() => generate.mutate()}
                disabled={busy || summary.total === 0 || !validRange}
              >
                {generate.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Rédiger avec l'assistant
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
