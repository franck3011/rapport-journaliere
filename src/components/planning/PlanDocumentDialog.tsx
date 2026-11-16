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
import { FileText, Loader2, Printer, Save, Sparkles } from "lucide-react";
import {
  createPlanReportFromNarrative,
  generatePlanNarrative,
  type PlanNarrative,
} from "@/lib/planning/planning.functions";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Ouvre une fenêtre propre et lance l'impression du document. */
function printNarrative(doc: PlanNarrative, period: string) {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) {
    toast.error("Autorisez les fenêtres pop-up pour imprimer.");
    return;
  }

  const sections = doc.sections
    .map(
      (section) => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        ${section.description ? `<p class="desc">${escapeHtml(section.description)}</p>` : ""}
        <ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
      </section>`,
    )
    .join("");

  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color:#111; line-height:1.55; max-width: 720px; margin: 0 auto; }
  header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 22px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .period { font-size: 12px; color:#555; text-transform: uppercase; letter-spacing:.06em; }
  h2 { font-size: 15px; margin: 22px 0 6px; border-bottom:1px solid #ddd; padding-bottom:4px; }
  p { margin: 0 0 10px; text-align: justify; }
  .desc { font-size: 13px; color:#555; }
  ul { margin: 0 0 10px 18px; padding: 0; }
  li { margin-bottom: 5px; }
  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 11px; color:#666; }
</style></head><body>
<header>
  <div class="period">${escapeHtml(period)}</div>
  <h1>${escapeHtml(doc.title)}</h1>
</header>
<p>${escapeHtml(doc.intro)}</p>
${sections}
${doc.conclusion ? `<p>${escapeHtml(doc.conclusion)}</p>` : ""}
<footer>Document généré par DailyBrief — ${new Date().toLocaleDateString("fr-FR")}</footer>
</body></html>`);

  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function PlanDocumentDialog({
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
  const generateFn = useServerFn(generatePlanNarrative);
  const createFn = useServerFn(createPlanReportFromNarrative);

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [doc, setDoc] = useState<PlanNarrative | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom);
    setTo(initialTo);
    setDoc(null);
  }, [open, initialFrom, initialTo]);

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

  const generate = useMutation({
    mutationFn: () => generateFn({ data: { from, to, mode: "plan" } }),
    onSuccess: (result) => setDoc(result),
    onError: (e: any) => toast.error(e?.message ?? "Génération impossible"),
  });

  const save = useMutation({
    mutationFn: () => createFn({ data: { narrative: doc! } }),
    onSuccess: ({ id }) => {
      toast.success("Plan enregistré comme rapport");
      onOpenChange(false);
      navigate({ to: "/reports/$id/edit", params: { id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Enregistrement impossible"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Plan de la période
          </DialogTitle>
          <DialogDescription>
            L'assistant rédige un document à partir des travaux planifiés. Tu peux l'imprimer
            directement ou l'enregistrer comme rapport.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="doc-from" className="text-xs">Du</Label>
            <Input
              id="doc-from"
              type="date"
              className="h-9 w-[150px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-to" className="text-xs">Au</Label>
            <Input
              id="doc-to"
              type="date"
              className="h-9 w-[150px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button
            className="ml-auto"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !from || !to || from > to}
          >
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {doc ? "Régénérer" : "Générer le plan"}
          </Button>
        </div>

        {doc ? (
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border bg-white p-6 text-foreground shadow-sm dark:bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{period}</p>
            <h2 className="mt-1 text-xl font-semibold leading-snug">{doc.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{doc.intro}</p>

            {doc.sections.map((section, index) => (
              <div key={index} className="mt-5">
                <h3 className="border-b pb-1 text-[15px] font-semibold">{section.title}</h3>
                {section.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex} className="flex gap-2 text-sm leading-relaxed">
                      <span className="text-muted-foreground">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {doc.conclusion && (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{doc.conclusion}</p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed py-14 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">Aucun document pour l'instant</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choisis les dates puis clique sur « Générer le plan ».
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {doc && (
            <>
              <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer comme rapport
              </Button>
              <Button onClick={() => printNarrative(doc, period)}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
