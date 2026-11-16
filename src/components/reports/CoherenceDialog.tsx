import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { reviewReportDraft, type ReviewFinding } from "@/lib/reports/review.functions";

export type CoherencePayload = {
  title: string;
  intro: string;
  conclusion: string;
  sections: { title: string; description: string; bullets: string[] }[];
};

const SEVERITY_STYLE: Record<
  ReviewFinding["severity"],
  { icon: typeof AlertTriangle; tone: string; label: string }
> = {
  error: { icon: AlertTriangle, tone: "text-destructive", label: "À corriger" },
  warning: { icon: AlertTriangle, tone: "text-amber-500", label: "À vérifier" },
  info: { icon: Info, tone: "text-muted-foreground", label: "Remarque" },
};

function scoreTone(score: number): { bar: string; text: string; verdict: string } {
  if (score >= 85)
    return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", verdict: "Prêt à envoyer" };
  if (score >= 60)
    return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", verdict: "Quelques retouches" };
  return { bar: "bg-destructive", text: "text-destructive", verdict: "À retravailler" };
}

export function CoherenceDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  payload: CoherencePayload;
}) {
  const reviewFn = useServerFn(reviewReportDraft);

  const review = useMutation({
    mutationFn: () => reviewFn({ data: payload }),
  });

  useEffect(() => {
    if (open && !review.data && !review.isPending) review.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const result = review.data;
  const tone = result ? scoreTone(result.score) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Contrôle de cohérence
          </DialogTitle>
          <DialogDescription>
            L'agent relit l'ensemble du rapport et signale ce qui ne tient pas debout. Il ne modifie
            rien.
          </DialogDescription>
        </DialogHeader>

        {review.isPending && (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture du document en cours…
          </div>
        )}

        {review.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Le contrôle n'a pas pu aboutir.</p>
            <p className="mt-1 text-muted-foreground">
              {(review.error as Error)?.message ?? "Réessayez dans un instant."}
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-5">
            <div className="rounded-xl border p-4">
              <div className="flex items-baseline gap-3">
                <span className={`text-3xl font-semibold tabular-nums ${tone!.text}`}>
                  {result.score}
                </span>
                <span className="text-sm text-muted-foreground">/ 100</span>
                <span className={`ml-auto text-sm font-medium ${tone!.text}`}>
                  {tone!.verdict}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${tone!.bar}`}
                  style={{ width: `${result.score}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{result.summary}</p>
            </div>

            {result.findings.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm">
                  Aucune incohérence détectée. Le document peut être envoyé.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {result.findings.length} point{result.findings.length > 1 ? "s" : ""} relevé
                  {result.findings.length > 1 ? "s" : ""}
                </p>
                {result.findings.map((finding, index) => {
                  const style = SEVERITY_STYLE[finding.severity];
                  const Icon = style.icon;
                  return (
                    <div key={index} className="rounded-lg border p-3">
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.tone}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {finding.message}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium">{finding.section}</span>
                            {finding.suggestion ? ` — ${finding.suggestion}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => review.mutate()}
            disabled={review.isPending}
          >
            {review.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Relancer
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
