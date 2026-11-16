import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays,
  ChevronLeft,
  FileText,
  Loader2,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  deletePlanDocument,
  listPlanDocuments,
  savePlanDocument,
  type PlanDocument,
  type PlanSection,
} from "@/lib/planning/plan-documents.functions";
import { structurePlanFromText } from "@/lib/planning/planning.functions";
import { printNarrative } from "@/components/planning/PlanDocumentDialog";

export const Route = createFileRoute("/_authenticated/planning")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      {
        name: "description",
        content: "Rédigez et imprimez le document qui décrit ce qui va se passer sur une période.",
      },
      { property: "og:title", content: "Planning — DailyBrief" },
      { property: "og:description", content: "Le document de prévision, période par période." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

/* ------------------------------- dates ---------------------------------- */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const startOfWeek = (d: Date) => {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
};

const fr = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

type Draft = {
  id?: string;
  title: string;
  intro: string;
  conclusion: string;
  sections: PlanSection[];
  periodStart: string;
  periodEnd: string;
  summary: string;
};

const emptyDraft = (): Draft => {
  const start = startOfWeek(new Date());
  return {
    title: "",
    intro: "",
    conclusion: "",
    sections: [],
    periodStart: iso(start),
    periodEnd: iso(addDays(start, 6)),
    summary: "",
  };
};

/* -------------------------------- page ---------------------------------- */

function PlanningPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlanDocuments);
  const saveFn = useServerFn(savePlanDocument);
  const deleteFn = useServerFn(deletePlanDocument);
  const structureFn = useServerFn(structurePlanFromText);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["plan-documents"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plan-documents"] });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Document supprimé");
      invalidate();
      setDraft(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  const structure = useMutation({
    mutationFn: () =>
      structureFn({
        data: { text: draft!.summary, from: draft!.periodStart, to: draft!.periodEnd },
      }),
    onSuccess: ({ document: doc }) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              title: doc.title,
              intro: doc.intro,
              conclusion: doc.conclusion,
              sections: doc.sections,
            }
          : current,
      );
      toast.success("Document rédigé — relis et ajuste si besoin");
    },
    onError: (e: any) => toast.error(e?.message ?? "Rédaction impossible"),
  });

  async function save() {
    if (!draft) return;
    if (draft.title.trim().length === 0) {
      toast.error("Donne un titre à ce document.");
      return;
    }
    setSaving(true);
    try {
      const { id } = await saveFn({
        data: {
          id: draft.id,
          title: draft.title.trim(),
          intro: draft.intro,
          conclusion: draft.conclusion,
          sections: draft.sections.filter((s) => s.title.trim() || s.bullets.some(Boolean)),
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
        },
      });
      setDraft((current) => (current ? { ...current, id } : current));
      toast.success("Document enregistré");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  const periodLabel = draft
    ? `Période du ${fr(draft.periodStart)} au ${fr(draft.periodEnd)}`
    : "";

  /* ------------------------------ éditeur ------------------------------ */

  if (draft) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            <ChevronLeft className="h-4 w-4 mr-1.5" />
            Retour
          </Button>
          <h1 className="text-lg font-semibold">
            {draft.id ? "Modifier le planning" : "Nouveau planning"}
          </h1>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {draft.id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce planning ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Le document sera définitivement supprimé.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(draft.id!)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                printNarrative(
                  {
                    title: draft.title || "Planning",
                    intro: draft.intro,
                    conclusion: draft.conclusion,
                    sections: draft.sections,
                  },
                  periodLabel,
                )
              }
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Imprimer
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>

        {/* Période */}
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="doc-from" className="text-xs">Du</Label>
              <Input
                id="doc-from"
                type="date"
                className="h-9 w-[150px]"
                value={draft.periodStart}
                onChange={(e) =>
                  setDraft({ ...draft, periodStart: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="doc-to" className="text-xs">Au</Label>
              <Input
                id="doc-to"
                type="date"
                className="h-9 w-[150px]"
                value={draft.periodEnd}
                onChange={(e) => setDraft({ ...draft, periodEnd: e.target.value })}
              />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{periodLabel}</p>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="doc-summary">Ton résumé de la période</Label>
            <Textarea
              id="doc-summary"
              rows={4}
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              placeholder="Ex. Cette semaine est consacrée à la maintenance de tout le parc informatique : nettoyage et mise à jour des postes, remplacement des disques des serveurs, sauvegarde complète."
              maxLength={6000}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => structure.mutate()}
                disabled={structure.isPending || draft.summary.trim().length < 10}
              >
                {structure.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                Rédiger avec l'assistant
              </Button>
              <span className="text-[11px] text-muted-foreground">
                L'assistant ne peut pas inventer : il structure uniquement ce que tu écris.
              </span>
            </div>
          </div>
        </div>

        {/* Le document */}
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Titre du document</Label>
            <Input
              id="doc-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Ex. Plan de maintenance informatique"
              maxLength={300}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-intro">Introduction</Label>
            <Textarea
              id="doc-intro"
              rows={3}
              value={draft.intro}
              onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
              placeholder="Ce que la période doit accomplir, en quelques phrases."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Sections</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    sections: [...draft.sections, { title: "", description: "", bullets: [] }],
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Ajouter une section
              </Button>
            </div>

            {draft.sections.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Aucune section. Écris ton résumé et clique sur « Rédiger avec l'assistant », ou
                ajoute une section à la main.
              </p>
            )}

            {draft.sections.map((section, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.title}
                    onChange={(e) => {
                      const sections = [...draft.sections];
                      sections[index] = { ...section, title: e.target.value };
                      setDraft({ ...draft, sections });
                    }}
                    placeholder="Titre de la section"
                    className="h-9"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label="Supprimer la section"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sections: draft.sections.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <Textarea
                  rows={4}
                  value={section.bullets.join("\n")}
                  onChange={(e) => {
                    const sections = [...draft.sections];
                    sections[index] = {
                      ...section,
                      bullets: e.target.value.split("\n"),
                    };
                    setDraft({ ...draft, sections });
                  }}
                  placeholder="Une ligne par point."
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-conclusion">Conclusion</Label>
            <Textarea
              id="doc-conclusion"
              rows={3}
              value={draft.conclusion}
              onChange={(e) => setDraft({ ...draft, conclusion: e.target.value })}
              placeholder="Ce qui conditionne la réussite de la période."
            />
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------- liste ------------------------------- */

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            Planning
          </h1>
          <p className="text-sm text-muted-foreground">
            Le document qui décrit ce qui va se passer pendant une période.
          </p>
        </div>
        <Button className="ml-auto" size="sm" onClick={() => setDraft(emptyDraft())}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau planning
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Aucun planning rédigé</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crée le premier : décris la période, l'assistant rédige le document, tu l'imprimes.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau planning
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: PlanDocument) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setDraft(documentToDraft(doc))}
              className="block w-full rounded-lg border bg-card px-4 py-3 text-left transition hover:bg-muted/50"
            >
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {fr(doc.period_start)} → {fr(doc.period_end)}
                </span>
              </div>
              {doc.intro && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {doc.intro}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {doc.sections.length} section{doc.sections.length > 1 ? "s" : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function documentToDraft(doc: PlanDocument): Draft {
  return {
    id: doc.id,
    title: doc.title,
    intro: doc.intro,
    conclusion: doc.conclusion,
    sections: doc.sections,
    periodStart: doc.period_start,
    periodEnd: doc.period_end,
    summary: "",
  };
}
