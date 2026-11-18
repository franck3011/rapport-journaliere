import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays,
  Circle,
  FileText,
  Loader2,
  Download,
  MoreHorizontal,
  Pen,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  createPlanReportFromNarrative,
  listPlanReports,
  structurePlanFromText,
  type StructuredPlan,
} from "@/lib/planning/planning.functions";
import { deleteReport, getReport } from "@/lib/reports.functions";
import { downloadReportPdf } from "@/lib/pdf-utils";

export const Route = createFileRoute("/_authenticated/planning/")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      {
        name: "description",
        content: "Rédigez, partagez et imprimez le document qui décrit ce qui va se passer.",
      },
      { property: "og:title", content: "Planning — DailyBrief" },
      { property: "og:description", content: "Le planning : un rapport tourné vers l'avenir." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const startOfWeek = (d: Date) => {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
};

const formatLongDate = (value: string) =>
  new Date(value + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function PlanningPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listPlanReports);
  const structureFn = useServerFn(structurePlanFromText);
  const createFn = useServerFn(createPlanReportFromNarrative);
  const deleteFn = useServerFn(deleteReport);
  const getReportFn = useServerFn(getReport);

  const weekStart = startOfWeek(new Date());
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(iso(weekStart));
  const [to, setTo] = useState(iso(addDays(weekStart, 6)));
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState<StructuredPlan | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plan-reports"],
    queryFn: () => listFn(),
  });

  const structure = useMutation({
    mutationFn: () => structureFn({ data: { text: summary.trim(), from, to } }),
    onSuccess: (value) => setPreview(value),
    onError: (e: any) => toast.error(e?.message ?? "Rédaction impossible"),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { narrative: preview!.document, reportDate: from } }),
    onSuccess: async ({ id }) => {
      toast.success("Planning créé");
      await qc.invalidateQueries({ queryKey: ["plan-reports"] });
      setOpen(false);
      setPreview(null);
      setSummary("");
      navigate({ to: "/planning/$id/edit", params: { id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Création impossible"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Planning supprimé");
      setToDelete(null);
      await qc.invalidateQueries({ queryKey: ["plan-reports"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  const busy = structure.isPending || create.isPending;

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(planId: string) {
    setDownloadingId(planId);
    try {
      const full = await getReportFn({ data: { id: planId } });
      if (!full) throw new Error("Planning introuvable.");
      await downloadReportPdf(full);
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDays className="h-6 w-6 text-primary" />
            Planning
          </h1>
          <p className="text-sm text-muted-foreground">
            Un rapport tourné vers l'avenir : ce qui va se passer sur la période.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau planning
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="h-40 animate-pulse p-5" />
            </Card>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Aucun planning rédigé</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Décris la période, l'assistant rédige, puis tu partages ou tu imprimes comme un rapport.
          </p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau planning
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Circle className="h-3.5 w-3.5" />
                    {formatLongDate(plan.report_date)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Télécharger en PDF"
                      title="Télécharger en PDF"
                      disabled={downloadingId === plan.id}
                      onClick={() => void download(plan.id)}
                    >
                      {downloadingId === plan.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          navigate({ to: "/planning/$id", params: { id: plan.id } })
                        }
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Ouvrir
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          navigate({ to: "/planning/$id/edit", params: { id: plan.id } })
                        }
                      >
                        <Pen className="h-4 w-4 mr-2" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setToDelete(plan.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                </div>

                <button
                  type="button"
                  className="text-left"
                  onClick={() => navigate({ to: "/planning/$id", params: { id: plan.id } })}
                >
                  <h2 className="line-clamp-2 text-lg font-bold leading-snug">
                    {plan.title || "(sans titre)"}
                  </h2>
                  {plan.intro && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {plan.intro}
                    </p>
                  )}
                </button>

                <div className="mt-auto border-t pt-3 text-sm text-muted-foreground">
                  Par {plan.author_name || "—"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Suppression */}
      <Dialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce planning ?</DialogTitle>
            <DialogDescription>
              Le document sera définitivement supprimé, ainsi que ses liens de partage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => toDelete && remove.mutate(toDelete)}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Création assistée */}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setPreview(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Nouveau planning
            </DialogTitle>
            <DialogDescription>
              Décris ce qui va se passer. L'assistant rédige le document, puis tu le modifies,
              le partages et l'imprimes comme un rapport.
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="plan-from" className="text-xs">Du</Label>
                  <Input
                    id="plan-from"
                    type="date"
                    className="h-9 w-[150px]"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plan-to" className="text-xs">Au</Label>
                  <Input
                    id="plan-to"
                    type="date"
                    className="h-9 w-[150px]"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-summary">Ton résumé de la période</Label>
                <Textarea
                  id="plan-summary"
                  rows={6}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Ex. Cette semaine est consacrée à la maintenance de tout le parc informatique : nettoyage et mise à jour des postes, remplacement des disques des serveurs, sauvegarde complète avant intervention."
                  maxLength={6000}
                />
                <p className="text-[11px] text-muted-foreground">
                  L'assistant structure uniquement ce que tu écris — il n'invente rien.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-lg border bg-white p-5 dark:bg-card">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Période du {formatLongDate(from)} au {formatLongDate(to)}
              </p>
              <h3 className="text-lg font-semibold leading-snug">{preview.document.title}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {preview.document.intro}
              </p>
              {preview.document.sections.map((section, index) => (
                <div key={index}>
                  <h4 className="text-sm font-semibold">{section.title}</h4>
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
              {preview.document.conclusion && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {preview.document.conclusion}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {!preview ? (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Annuler
                </Button>
                <Button
                  onClick={() => structure.mutate()}
                  disabled={busy || summary.trim().length < 10 || from > to}
                >
                  {structure.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Rédiger avec l'assistant
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => setPreview(null)}
                  disabled={busy}
                >
                  Modifier le résumé
                </Button>
                <Button onClick={() => create.mutate()} disabled={busy}>
                  {create.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Créer le planning
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
