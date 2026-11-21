import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMinute, deleteMinute, type ReportMinute } from "@/lib/minutes.functions";
import { getReport } from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Download,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  FileSignature,
} from "lucide-react";
import { MinuteForm } from "@/components/MinuteForm";
import { downloadMinutePdf } from "@/lib/pdf-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/minutes/$id")({
  head: () => ({
    meta: [
      { title: "Procès-verbal — DailyBrief" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MinuteDetailPage,
});

function formatDT(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function MinuteDetailPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getMinute);
  const delFn = useServerFn(deleteMinute);
  const reportFn = useServerFn(getReport);

  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const q = useQuery({
    queryKey: ["minute", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const rq = useQuery({
    queryKey: ["report-lite", q.data?.report_id],
    queryFn: () => reportFn({ data: { id: q.data!.report_id } }),
    enabled: !!q.data?.report_id,
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("PV supprimé");
      queryClient.invalidateQueries({ queryKey: ["minutes"] });
      navigate({ to: "/minutes" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  async function handleDownload(m: ReportMinute) {
    setDownloading(true);
    try {
      await downloadMinutePdf(m, rq.data?.title ?? "Rapport");
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    } finally {
      setDownloading(false);
    }
  }

  const m = q.data;
  const isMine = m?.author_id === user.id;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-3">
          <Link to="/minutes">
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour aux PV
          </Link>
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-96 w-full" />}
      {q.isError && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Procès-verbal introuvable ou accès refusé.
          </CardContent>
        </Card>
      )}

      {m && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
                <FileSignature className="h-7 w-7 text-primary" />
                {m.number}
              </h1>
              {m.subject && (
                <p className="text-lg text-muted-foreground mt-1">{m.subject}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleDownload(m)}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
              <Button variant="outline" asChild>
                <Link
                  to="/reports/$id"
                  params={{ id: m.report_id }}
                  hash="proces-verbal"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Rapport source
                </Link>
              </Button>
              {isMine && (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDel(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <InfoRow label="Date & heure" value={formatDT(m.held_at)} />
                <InfoRow label="Lieu" value={m.location || "—"} />
                <InfoRow label="Signataire" value={m.signer_name || "—"} />
                <InfoRow label="Fonction" value={m.signer_role || "—"} />
              </div>

              {m.attendees && m.attendees.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Participants</h3>
                  <ul className="text-sm space-y-1">
                    {m.attendees.map((a, i) => (
                      <li key={i}>
                        <span className="font-medium">{a.name || "—"}</span>
                        {a.role ? ` — ${a.role}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.facts && (
                <div>
                  <h3 className="font-semibold mb-2">Faits</h3>
                  <div className="text-sm whitespace-pre-wrap">{m.facts}</div>
                </div>
              )}

              {m.decisions && (
                <div>
                  <h3 className="font-semibold mb-2">Décisions</h3>
                  <div className="text-sm whitespace-pre-wrap">{m.decisions}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <MinuteForm
            open={editing}
            onOpenChange={setEditing}
            reportId={m.report_id}
            minute={m}
          />
          <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce procès-verbal ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est définitive.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={del.isPending}>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  disabled={del.isPending}
                  onClick={() => del.mutate()}
                >
                  {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
