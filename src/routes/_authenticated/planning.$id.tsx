import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ChevronLeft, Copy, Loader2, Pencil, Printer, Share2, Trash2 } from "lucide-react";
import {
  createPlanShare,
  deletePlanDocument,
  getPlanDocument,
  listPlanShares,
  revokePlanShare,
} from "@/lib/planning/plan-documents.functions";
import { PlanDocumentView } from "@/components/planning/PlanDocumentView";
import { printNarrative } from "@/components/planning/PlanDocumentDialog";

export const Route = createFileRoute("/_authenticated/planning/$id")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      { name: "description", content: "Document de prévision d'une période." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlanViewPage,
});

const fr = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function PlanViewPage() {
  const { id } = useParams({ from: "/_authenticated/planning/$id" });
  const qc = useQueryClient();
  const getFn = useServerFn(getPlanDocument);
  const deleteFn = useServerFn(deletePlanDocument);
  const sharesFn = useServerFn(listPlanShares);
  const createShareFn = useServerFn(createPlanShare);
  const revokeFn = useServerFn(revokePlanShare);

  const [shareOpen, setShareOpen] = useState(false);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-document", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const { data: shares = [] } = useQuery({
    queryKey: ["plan-shares", id],
    queryFn: () => sharesFn({ data: { planId: id } }),
    enabled: shareOpen,
  });

  const createShare = useMutation({
    mutationFn: () => createShareFn({ data: { planId: id, days: 30 } }),
    onSuccess: (share) => {
      const url = `${window.location.origin}/share/plan/${share.token}`;
      void navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Lien copié (valable 30 jours)");
      void qc.invalidateQueries({ queryKey: ["plan-shares", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Partage impossible"),
  });

  const revoke = useMutation({
    mutationFn: (shareId: string) => revokeFn({ data: { id: shareId } }),
    onSuccess: () => {
      toast.success("Lien révoqué");
      void qc.invalidateQueries({ queryKey: ["plan-shares", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Révocation impossible"),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Planning supprimé");
      await qc.invalidateQueries({ queryKey: ["plan-documents"] });
      window.location.href = "/planning";
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-sm font-medium">Document introuvable</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/planning">Retour au planning</Link>
        </Button>
      </div>
    );
  }

  const periodLabel = `Période du ${fr(plan.period_start)} au ${fr(plan.period_end)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/planning">
            <ChevronLeft className="h-4 w-4 mr-1.5" />
            Planning
          </Link>
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4 mr-1.5" />
            Partager
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              printNarrative(
                {
                  title: plan.title,
                  intro: plan.intro,
                  conclusion: plan.conclusion,
                  sections: plan.sections,
                },
                periodLabel,
              )
            }
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimer
          </Button>
          <Button asChild size="sm">
            <Link to="/planning/$id/edit" params={{ id }}>
              <Pencil className="h-4 w-4 mr-1.5" />
              Modifier
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Supprimer">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce planning ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Le document et ses liens de partage seront définitivement supprimés.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <PlanDocumentView
        title={plan.title}
        intro={plan.intro}
        conclusion={plan.conclusion}
        sections={plan.sections}
        periodLabel={periodLabel}
      />

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Partager ce planning
            </DialogTitle>
            <DialogDescription>
              Un lien en lecture seule, valable 30 jours. La personne n'a pas besoin de compte.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button onClick={() => createShare.mutate()} disabled={createShare.isPending}>
              {createShare.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Créer un lien et le copier
            </Button>

            {shares.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Liens actifs
                </p>
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      /share/plan/{share.token}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const url = `${window.location.origin}/share/plan/${share.token}`;
                        void navigator.clipboard?.writeText(url).catch(() => {});
                        toast.success("Lien copié");
                      }}
                    >
                      Copier
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => revoke.mutate(share.id)}
                    >
                      Révoquer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShareOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
