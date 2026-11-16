import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { FileText, ListPlus, Loader2, Printer, Sparkles } from "lucide-react";
import {
  createPlanItemsBulk,
  createPlanReportFromNarrative,
  structurePlanFromText,
  type StructuredPlan,
} from "@/lib/planning/planning.functions";
import { printNarrative } from "@/components/planning/PlanDocumentDialog";

const EXAMPLE =
  "Cette semaine est consacrée à la maintenance de tout le parc informatique : " +
  "nettoyage et mise à jour des postes de la comptabilité, remplacement des disques " +
  "des serveurs, puis sauvegarde complète avant intervention.";

export function PlanDraftDialog({
  open,
  onOpenChange,
  initialFrom,
  initialTo,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialFrom: string;
  initialTo: string;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const structureFn = useServerFn(structurePlanFromText);
  const bulkFn = useServerFn(createPlanItemsBulk);
  const saveReportFn = useServerFn(createPlanReportFromNarrative);

  const [text, setText] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [result, setResult] = useState<StructuredPlan | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setFrom(initialFrom);
    setTo(initialTo);
    setResult(null);
    setCreated(false);
  }, [open, initialFrom, initialTo]);

  const structure = useMutation({
    mutationFn: () => structureFn({ data: { text: text.trim(), from, to } }),
    onSuccess: (value) => setResult(value),
    onError: (e: any) => toast.error(e?.message ?? "Structuration impossible"),
  });

  const createItems = useMutation({
    mutationFn: () => bulkFn({ data: { items: result!.travaux } }),
    onSuccess: ({ count }) => {
      toast.success(`${count} travail(x) ajouté(s) au planning`);
      setCreated(true);
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message ?? "Création impossible"),
  });

  const saveReport = useMutation({
    mutationFn: () => saveReportFn({ data: { narrative: result!.document } }),
    onSuccess: ({ id }) => {
      toast.success("Plan enregistré comme rapport");
      onOpenChange(false);
      navigate({ to: "/reports/$id/edit", params: { id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Enregistrement impossible"),
  });

  const period = `Période du ${new Date(from + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })} au ${new Date(to + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;

  const busy = structure.isPending || createItems.isPending || saveReport.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Planifier avec l'assistant
          </DialogTitle>
          <DialogDescription>
            Écris ce que tu veux faire pendant la période. L'assistant en fait un plan
            structuré — et la liste des travaux à créer.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="draft-from" className="text-xs">Du</Label>
                <Input
                  id="draft-from"
                  type="date"
                  className="h-9 w-[150px]"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="draft-to" className="text-xs">Au</Label>
                <Input
                  id="draft-to"
                  type="date"
                  className="h-9 w-[150px]"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="draft-text">Ton résumé de la période</Label>
              <Textarea
                id="draft-text"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                maxLength={6000}
              />
              <p className="text-[11px] text-muted-foreground">
                Écris comme tu parlerais à ton équipe. L'assistant ne peut pas inventer de
                travail : il structure uniquement ce que tu as écrit.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {created && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                Les travaux ont été ajoutés au planning. Le document reste affiché : tu peux
                l'imprimer ou l'enregistrer comme rapport.
              </div>
            )}
            <div className="max-h-[45vh] overflow-y-auto rounded-lg border bg-white p-5 text-foreground dark:bg-card">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {period}
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-snug">{result.document.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {result.document.intro}
              </p>
              {result.document.sections.map((section, index) => (
                <div key={index} className="mt-4">
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <ul className="mt-1 space-y-1">
                    {section.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex} className="flex gap-2 text-sm leading-relaxed">
                        <span className="text-muted-foreground">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {result.document.conclusion && (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {result.document.conclusion}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {result.travaux.length} travail(x) à planifier
              </p>
              <div className="max-h-[22vh] space-y-1.5 overflow-y-auto">
                {result.travaux.map((travail, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-md border px-3 py-2"
                  >
                    <span className="w-16 shrink-0 text-[11px] font-medium uppercase text-muted-foreground">
                      {new Date(travail.date + "T00:00:00Z").toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{travail.titre}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!result ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Annuler
              </Button>
              <Button
                onClick={() => structure.mutate()}
                disabled={busy || text.trim().length < 10 || from > to}
              >
                {structure.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Structurer avec l'assistant
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => setResult(null)}
                disabled={busy}
              >
                Modifier le résumé
              </Button>
              <Button
                variant="outline"
                onClick={() => result && printNarrative(result.document, period)}
                disabled={busy}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimer
              </Button>
              <Button
                variant="outline"
                onClick={() => saveReport.mutate()}
                disabled={busy}
              >
                {saveReport.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Enregistrer comme rapport
              </Button>
              {created ? (
                <Button onClick={() => onOpenChange(false)}>Fermer</Button>
              ) : (
                <Button
                  onClick={() => createItems.mutate()}
                  disabled={busy || result.travaux.length === 0}
                >
                  {createItems.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ListPlus className="mr-2 h-4 w-4" />
                  )}
                  Créer les travaux
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
