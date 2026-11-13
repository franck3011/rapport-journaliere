import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getReport,
  deleteReport,
  duplicateReport,
  getShareToken,
  enableShare,
  revokeShare,
  logShareCopy,
  getShareAuditLog,
} from "@/lib/reports.functions";
import { getMyShareForReport } from "@/lib/shares.functions";
import { SharePeopleDialog } from "@/components/SharePeopleDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetView } from "@/components/budget/BudgetView";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Download,
  Share2,
  Pencil,
  Trash2,
  Loader2,
  Copy,
  Link as LinkIcon,
  Users,
  Check,
  RefreshCcw,
  Clock,
  History,
  
} from "lucide-react";
import { formatLongDate } from "@/lib/date-utils";
import { Lightbox } from "@/components/Lightbox";
import { AttachmentsView } from "@/components/AttachmentUploader";
import { ReportNotes } from "@/components/ReportNotes";
import { ReportActionsCard } from "@/components/reports/ReportActionsCard";
import { ReportSignaturePanel } from "@/components/reports/ReportSignaturePanel";
import { SendReportButtons } from "@/components/reports/SendReportButtons";
import { ReportWorkflowCard, ReportStatusBadge } from "@/components/ReportWorkflowCard";
import { getApprovalTimeline } from "@/lib/approvals.functions";



import { useEffect, useState } from "react";
import { toast } from "sonner";
import { downloadReportPdf, shareReportPdf } from "@/lib/pdf-utils";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/reports/$id/")({
  head: () => ({
    meta: [
      { title: `Rapport — Lovable Rapports` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportDetailPage,
});

function RichText({ text }: { text: string }) {
  const paras = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return null;
  return (
    <div className="space-y-5 text-foreground/90 leading-relaxed">
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}

const EXPIRATION_OPTIONS: { value: string; label: string; days: number | null }[] =
  [
    { value: "none", label: "Sans expiration", days: null },
    { value: "1", label: "24 heures", days: 1 },
    { value: "7", label: "7 jours", days: 7 },
    { value: "30", label: "30 jours", days: 30 },
    { value: "90", label: "90 jours", days: 90 },
  ];

function actionLabel(action: string): string {
  switch (action) {
    case "created":
      return "Lien créé";
    case "regenerated":
      return "Lien régénéré";
    case "revoked":
      return "Lien révoqué";
    case "copied":
      return "Lien copié";
    case "viewed":
      return "Consultation";
    case "exported":
      return "Export PDF";
    default:
      return action;
  }
}

function ReportDetailPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOne = useServerFn(getReport);
  const fetchTimeline = useServerFn(getApprovalTimeline);

  const del = useServerFn(deleteReport);
  const dup = useServerFn(duplicateReport);
  const getToken = useServerFn(getShareToken);
  const enable = useServerFn(enableShare);
  const revoke = useServerFn(revokeShare);
  const logCopy = useServerFn(logShareCopy);
  const fetchAudit = useServerFn(getShareAuditLog);

  const query = useQuery({
    queryKey: ["report", id],
    queryFn: () => fetchOne({ data: { id } }),
  });

  const [lightbox, setLightbox] = useState<{
    images: { url: string; id: string }[];
    index: number;
  } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareExpires, setShareExpires] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expirationChoice, setExpirationChoice] = useState<string>("7");
  const [showAudit, setShowAudit] = useState(false);
  const [peopleShareOpen, setPeopleShareOpen] = useState(false);

  const fetchMyShare = useServerFn(getMyShareForReport);
  const myShareQuery = useQuery({
    queryKey: ["my-share", id],
    queryFn: () => fetchMyShare({ data: { reportId: id } }),
  });

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : "";

  const isExpired =
    !!shareExpires && new Date(shareExpires).getTime() < Date.now();

  useEffect(() => {
    if (!shareOpen) return;
    setShareLoading(true);
    getToken({ data: { id } })
      .then((r) => {
        setShareToken(r.token);
        setShareExpires(r.expires_at);
      })
      .catch(() => {
        setShareToken(null);
        setShareExpires(null);
      })
      .finally(() => setShareLoading(false));
  }, [shareOpen, id, getToken]);

  const auditQuery = useQuery({
    queryKey: ["share-audit", id],
    queryFn: () => fetchAudit({ data: { id } }),
    enabled: shareOpen && showAudit,
  });


  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Rapport supprimé");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      navigate({ to: "/reports" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  async function handleDownload() {
    if (!query.data) return;
    setDownloading(true);
    try {
      let approvals: Awaited<ReturnType<typeof fetchTimeline>> | undefined;
      try {
        approvals = await fetchTimeline({ data: { reportId: id } });
      } catch {
        approvals = undefined;
      }
      await downloadReportPdf(query.data, approvals);
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    if (!query.data) return;
    setSharing(true);
    try {
      await shareReportPdf(query.data);
    } catch (e: any) {
      toast.error(e?.message ?? "Partage impossible");
    } finally {
      setSharing(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await dup({ data: { id } });
      toast.success("Rapport dupliqué");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      navigate({ to: "/reports/$id/edit", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Duplication impossible");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleEnableShare() {
    setShareLoading(true);
    try {
      const opt = EXPIRATION_OPTIONS.find((o) => o.value === expirationChoice);
      const r = await enable({
        data: { id, expiresInDays: opt?.days ?? null },
      });
      setShareToken(r.token);
      setShareExpires(r.expires_at);
      queryClient.invalidateQueries({ queryKey: ["share-audit", id] });
      toast.success("Lien de partage généré");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'activer le partage");
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRegenerate() {
    await handleEnableShare();
  }

  async function handleRevokeShare() {
    setShareLoading(true);
    try {
      await revoke({ data: { id } });
      setShareToken(null);
      setShareExpires(null);
      queryClient.invalidateQueries({ queryKey: ["share-audit", id] });
      toast.success("Lien révoqué");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible de révoquer");
    } finally {
      setShareLoading(false);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      logCopy({ data: { id } }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["share-audit", id] });
    } catch {
      toast.error("Copie impossible");
    }
  }

  if (query.isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <Button variant="ghost" asChild>
          <Link to="/reports">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Link>
        </Button>
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-destructive">
            Rapport introuvable.
          </CardContent>
        </Card>
      </div>
    );
  }

  const r = query.data;
  const isMine = r.author_id === user.id;
  const myShare = myShareQuery.data ?? null;
  const canEdit = isMine || myShare?.permission === "edit";
  

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link to="/reports">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Télécharger PDF
          </Button>
          <Button variant="outline" onClick={handleShare} disabled={sharing}>
            {sharing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4 mr-2" />
            )}
            Partager PDF
          </Button>
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <LinkIcon className="h-4 w-4 mr-2" />
            Lien de partage
          </Button>
          {isMine && <SendReportButtons reportId={r.id} title={r.title} date={r.report_date} />}
          <Button
            variant="outline"
            onClick={handleDuplicate}
            disabled={duplicating}
          >
            {duplicating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Dupliquer
          </Button>
          <Button variant="outline" onClick={() => setPeopleShareOpen(true)}>
            <Users className="h-4 w-4 mr-2" />
            Partager à une personne
          </Button>
          {canEdit && !isMine && (
            <Button variant="outline" asChild>
              <Link to="/reports/$id/edit" params={{ id: r.id }}>
                <Pencil className="h-4 w-4 mr-2" />
                Modifier
              </Link>
            </Button>
          )}
          {isMine && (
            <>
              <Button variant="outline" asChild>
                <Link to="/reports/$id/edit" params={{ id: r.id }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Modifier
                </Link>
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <img src="/logo-mbc.png" alt="Logo MBC" className="h-14 w-auto" />
          <div className="text-sm text-primary font-medium">
            {formatLongDate(r.report_date)}
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">{r.title}</h1>
        <div className="text-sm text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
          <span>
            Par <span className="font-medium text-foreground">{r.author_name}</span>
          </span>
          <ReportStatusBadge status={(r as any).status} />
        </div>
      </div>

      <ReportWorkflowCard
        reportId={r.id}
        status={((r as any).status ?? "draft") as any}
        isMine={isMine}
        isCurrentApprover={(r as any).current_approver_id === user.id}
      />
      {r.doc_type === "budget" && <BudgetView report={r} />}

      {r.doc_type !== "budget" && r.intro && (

        <section>
          <RichText text={r.intro} />
        </section>
      )}

      {r.sections.map((s) => (
        <section key={s.id} className="space-y-4">
          {s.title && <h2 className="text-xl font-semibold">{s.title}</h2>}
          {s.description && <RichText text={s.description} />}
          {s.bullets.length > 0 && (
            <ul className="list-disc pl-6 space-y-3">
              {s.bullets.map((b) => (
                <li key={b.id} className="leading-relaxed">
                  {b.content}
                </li>
              ))}
            </ul>
          )}
          {s.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {s.images.map((img, idx) => (
                <figure key={img.id} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        images: s.images.map((i) => ({
                          id: i.id,
                          url: i.url,
                        })),
                        index: idx,
                      })
                    }
                    className="block w-full aspect-square rounded-md overflow-hidden bg-muted border border-border"
                  >
                    <img
                      src={img.url}
                      alt={img.caption || ""}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  </button>
                  {img.caption && (
                    <figcaption className="text-xs text-muted-foreground text-center leading-snug">
                      {img.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
          {s.attachments && s.attachments.length > 0 && (
            <AttachmentsView attachments={s.attachments} title="" />
          )}
        </section>
      ))}

      {r.doc_type !== "budget" && r.conclusion && (
        <section>
          <RichText text={r.conclusion} />
        </section>
      )}

      {r.general_images.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Images</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {r.general_images.map((img, idx) => (
              <figure key={img.id} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setLightbox({
                      images: r.general_images.map((i) => ({
                        id: i.id,
                        url: i.url,
                      })),
                      index: idx,
                    })
                  }
                  className="block w-full aspect-square rounded-md overflow-hidden bg-muted border border-border"
                >
                  <img
                    src={img.url}
                    alt={img.caption || ""}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                </button>
                {img.caption && (
                  <figcaption className="text-xs text-muted-foreground text-center leading-snug">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      )}

      {r.general_attachments && r.general_attachments.length > 0 && (
        <AttachmentsView attachments={r.general_attachments} />
      )}

      <ReportSignaturePanel
        reportId={r.id}
        signature={r.signature}
        defaultName={r.author_name}
        canSign={canEdit}
      />

      <ReportActionsCard reportId={r.id} canEdit={canEdit} />

      <ReportNotes
        reportId={r.id}
        currentUserId={user.id}
        reportAuthorId={r.author_id}
        canWrite={!isMine}
      />

      <SharePeopleDialog
        reportId={r.id}
        open={peopleShareOpen}
        onOpenChange={setPeopleShareOpen}
      />





      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onChange={(i) => setLightbox({ ...lightbox, index: i })}
        />
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce rapport ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lien de partage en lecture seule</DialogTitle>
            <DialogDescription>
              Toute personne disposant de ce lien pourra consulter le rapport,
              sans se connecter.
            </DialogDescription>
          </DialogHeader>
          {shareLoading ? (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shareToken ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" onClick={copyShareUrl} variant="outline">
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {shareExpires ? (
                  isExpired ? (
                    <span className="text-destructive font-medium">
                      Lien expiré le {formatLongDate(shareExpires.slice(0, 10))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Expire le {formatLongDate(shareExpires.slice(0, 10))}
                    </span>
                  )
                ) : (
                  <span className="text-muted-foreground">Sans expiration</span>
                )}
              </div>
              {isMine && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Select
                      value={expirationChoice}
                      onValueChange={setExpirationChoice}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPIRATION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={handleRegenerate}
                      disabled={shareLoading}
                    >
                      <RefreshCcw className="h-4 w-4 mr-2" />
                      Régénérer
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={handleRevokeShare}
                  >
                    Révoquer
                  </Button>
                </div>
              )}
              <div className="border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAudit((v) => !v)}
                  className="text-sm"
                >
                  <History className="h-4 w-4 mr-2" />
                  {showAudit ? "Masquer" : "Afficher"} l'historique
                </Button>
                {showAudit && (
                  <div className="mt-3 max-h-64 overflow-y-auto border rounded-md divide-y">
                    {auditQuery.isLoading ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Chargement…
                      </div>
                    ) : (auditQuery.data ?? []).length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Aucun événement pour l'instant.
                      </div>
                    ) : (
                      (auditQuery.data ?? []).map((e) => (
                        <div
                          key={e.id}
                          className="px-3 py-2 text-xs flex items-center justify-between gap-2"
                        >
                          <span className="font-medium">
                            {actionLabel(e.action)}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("fr-FR")}
                            {e.ip ? ` · ${e.ip}` : ""}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Aucun lien actif pour ce rapport.
              </p>
              {isMine && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Expiration
                    </label>
                    <Select
                      value={expirationChoice}
                      onValueChange={setExpirationChoice}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPIRATION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleEnableShare}>
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Générer un lien
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
