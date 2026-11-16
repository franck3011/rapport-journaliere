import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import {
  getPlanDocument,
  savePlanDocument,
  type PlanSection,
} from "@/lib/planning/plan-documents.functions";
import { structurePlanFromText } from "@/lib/planning/planning.functions";

export const Route = createFileRoute("/_authenticated/planning/$id/edit")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      { name: "description", content: "Rédaction du document de prévision." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlanEditPage,
});

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

function PlanEditPage() {
  const { id } = useParams({ from: "/_authenticated/planning/$id/edit" });
  const navigate = useNavigate();
  const getFn = useServerFn(getPlanDocument);
  const saveFn = useServerFn(savePlanDocument);
  const structureFn = useServerFn(structurePlanFromText);

  const isNew = id === "new";
  const weekStart = startOfWeek(new Date());

  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [sections, setSections] = useState<PlanSection[]>([]);
  const [from, setFrom] = useState(iso(weekStart));
  const [to, setTo] = useState(iso(addDays(weekStart, 6)));
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(isNew);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["plan-document", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setIntro(existing.intro);
    setConclusion(existing.conclusion);
    setSections(existing.sections);
    setFrom(existing.period_start);
    setTo(existing.period_end);
    setReady(true);
  }, [existing]);

  const structure = useMutation({
    mutationFn: () => structureFn({ data: { text: summary, from, to } }),
    onSuccess: ({ document: doc }) => {
      setTitle(doc.title);
      setIntro(doc.intro);
      setConclusion(doc.conclusion);
      setSections(doc.sections);
      toast.success("Document rédigé — relis et ajuste si besoin");
    },
    onError: (e: any) => toast.error(e?.message ?? "Rédaction impossible"),
  });

  async function save() {
    if (title.trim().length === 0) {
      toast.error("Donne un titre à ce document.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveFn({
        data: {
          id: isNew ? undefined : id,
          title: title.trim(),
          intro,
          conclusion,
          sections: sections.filter((s) => s.title.trim() || s.bullets.some((b) => b.trim())),
          periodStart: from,
          periodEnd: to,
        },
      });
      toast.success("Planning enregistré");
      navigate({ to: "/planning/$id", params: { id: result.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !ready) {
    return (
      <div className="flex items-center gap-2 px-6 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={isNew ? "/planning" : "/planning/$id"} params={isNew ? {} : { id }}>
            <ChevronLeft className="h-4 w-4 mr-1.5" />
            Retour
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">
          {isNew ? "Nouveau planning" : "Modifier le planning"}
        </h1>
        <Button className="ml-auto" size="sm" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Enregistrer
        </Button>
      </div>

      {/* Période + résumé */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">Du</Label>
            <Input
              id="from"
              type="date"
              className="h-9 w-[150px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">Au</Label>
            <Input
              id="to"
              type="date"
              className="h-9 w-[150px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Période du {fr(from)} au {fr(to)}
          </p>
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <Label htmlFor="summary">Ton résumé de la période</Label>
          <Textarea
            id="summary"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Ex. Cette semaine est consacrée à la maintenance de tout le parc informatique : nettoyage et mise à jour des postes, remplacement des disques des serveurs, sauvegarde complète."
            maxLength={6000}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => structure.mutate()}
              disabled={structure.isPending || summary.trim().length < 10}
            >
              {structure.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              Rédiger avec l'assistant
            </Button>
            <span className="text-[11px] text-muted-foreground">
              L'assistant structure uniquement ce que tu écris.
            </span>
          </div>
        </div>
      </div>

      {/* Document */}
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">Titre du document</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. Plan de maintenance informatique"
            maxLength={300}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="intro">Introduction</Label>
          <Textarea
            id="intro"
            rows={3}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="Ce que la période doit accomplir."
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Sections</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSections([...sections, { title: "", description: "", bullets: [] }])
              }
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter une section
            </Button>
          </div>

          {sections.length === 0 && (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Aucune section. Écris ton résumé puis « Rédiger avec l'assistant », ou ajoute une
              section à la main.
            </p>
          )}

          {sections.map((section, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={section.title}
                  onChange={(e) => {
                    const next = [...sections];
                    next[index] = { ...section, title: e.target.value };
                    setSections(next);
                  }}
                  placeholder="Titre de la section"
                  className="h-9"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Supprimer la section"
                  onClick={() => setSections(sections.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Textarea
                rows={4}
                value={section.bullets.join("\n")}
                onChange={(e) => {
                  const next = [...sections];
                  next[index] = { ...section, bullets: e.target.value.split("\n") };
                  setSections(next);
                }}
                placeholder="Une ligne par point."
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="conclusion">Conclusion</Label>
          <Textarea
            id="conclusion"
            rows={3}
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            placeholder="Ce qui conditionne la réussite de la période."
          />
        </div>
      </div>
    </div>
  );
}
