import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listAllMinutes,
  deleteMinute,
  type MinuteListItem,
} from "@/lib/minutes.functions";
import { listReports } from "@/lib/reports.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  FileSignature,
  Search,
  Eye,
  Download,
  Pencil,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { MinuteView } from "@/components/MinuteView";
import { MinuteForm } from "@/components/MinuteForm";
import { downloadMinutePdf } from "@/lib/pdf-utils";
import { cn } from "@/lib/utils";
import { parseISO, format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/minutes/")({
  head: () => ({
    meta: [
      { title: "Procès-verbaux — DailyBrief" },
      {
        name: "description",
        content: "Tous les procès-verbaux liés aux rapports, groupés par mois.",
      },
    ],
  }),
  component: MinutesListPage,
});

function formatDT(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MinutesListPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAllMinutes);
  const delFn = useServerFn(deleteMinute);

  const q = useQuery({
    queryKey: ["minutes", "all"],
    queryFn: () => listFn(),
  });

  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [viewing, setViewing] = useState<MinuteListItem | null>(null);
  const [editing, setEditing] = useState<MinuteListItem | null>(null);
  const [confirmDel, setConfirmDel] = useState<MinuteListItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [creatingFor, setCreatingFor] = useState<{ id: string; title: string } | null>(null);

  const listReportsFn = useServerFn(listReports);
  const reportsQ = useQuery({
    queryKey: ["reports", "list-for-minute-picker"],
    queryFn: () => listReportsFn(),
    enabled: pickerOpen,
  });

  const filteredReports = useMemo(() => {
    const rows = reportsQ.data ?? [];
    const s = pickerSearch.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.title, r.author_name, r.intro].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
    );
  }, [reportsQ.data, pickerSearch]);

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    const s = search.trim().toLowerCase();
    return rows.filter((m) => {
      if (scope === "mine" && m.author_id !== user.id) return false;
      if (!s) return true;
      return [m.number, m.subject, m.report_title, m.author_name, m.location]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(s));
    });
  }, [q.data, search, scope, user.id]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: MinuteListItem[] }>();
    for (const m of filtered) {
      const d = parseISO(m.held_at);
      const key = format(d, "yyyy-MM");
      const label = format(d, "LLLL yyyy", { locale: fr });
      const cap = label.charAt(0).toUpperCase() + label.slice(1);
      if (!map.has(key)) map.set(key, { label: cap, items: [] });
      map.get(key)!.items.push(m);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, v]) => ({ key, ...v }));
  }, [filtered]);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("PV supprimé");
      queryClient.invalidateQueries({ queryKey: ["minutes"] });
      setConfirmDel(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  async function handleDownload(m: MinuteListItem) {
    setDownloadingId(m.id);
    try {
      await downloadMinutePdf(m, m.report_title);
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Procès-verbaux</h1>
          <p className="text-muted-foreground mt-1">
            Tous les PV liés aux rapports auxquels vous avez accès.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/minutes/dashboard">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Tableau de bord
            </Link>
          </Button>
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau PV
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-lg">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par numéro, sujet, rapport, auteur…"
            className="pl-9"
          />
        </div>
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-sm transition-colors",
              scope === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-sm transition-colors",
              scope === "mine"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Mes PV
          </button>
        </div>
      </div>

      {q.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {q.isError && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Impossible de charger les procès-verbaux.
          </CardContent>
        </Card>
      )}

      {q.data && q.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileSignature className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Aucun procès-verbal</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Créez un PV depuis n'importe quel rapport.
            </p>
            <Button onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un PV
            </Button>
          </CardContent>
        </Card>
      )}

      {q.data && q.data.length > 0 && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun PV ne correspond à votre recherche.
          </CardContent>
        </Card>
      )}

      {grouped.map((group) => (
        <section key={group.key} className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 pb-2 border-b border-border">
            {group.label}
            <span className="ml-2 text-xs font-normal normal-case tracking-normal">
              ({group.items.length})
            </span>
          </h2>
          <div className="space-y-2">
            {group.items.map((m) => {
              const isMine = m.author_id === user.id;
              return (
                <Card key={m.id}>
                  <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{m.number}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDT(m.held_at)}
                        </span>
                      </div>
                      {m.subject && (
                        <div className="text-sm mt-0.5 truncate">{m.subject}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                        <span>
                          Rapport :{" "}
                          <Link
                            to="/reports/$id"
                            params={{ id: m.report_id }}
                            className="text-primary hover:underline"
                          >
                            {m.report_title}
                          </Link>
                        </span>
                        <span>Par {m.author_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          navigate({ to: "/minutes/$id", params: { id: m.id } })
                        }
                      >
                        <Eye className="h-4 w-4 mr-1" /> Voir
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions sur le procès-verbal">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDownload(m)}
                            disabled={downloadingId === m.id}
                          >
                            {downloadingId === m.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Télécharger PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                to: "/reports/$id",
                                params: { id: m.report_id },
                                hash: "proces-verbal",
                              })
                            }
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ouvrir le rapport
                          </DropdownMenuItem>
                          {isMine && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setEditing(m)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmDel(m)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Supprimer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <MinuteView
        minute={viewing}
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
      />
      {editing && (
        <MinuteForm
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          reportId={editing.report_id}
          minute={editing}
        />
      )}
      {creatingFor && (
        <MinuteForm
          open={!!creatingFor}
          onOpenChange={(v) => {
            if (!v) {
              setCreatingFor(null);
              queryClient.invalidateQueries({ queryKey: ["minutes"] });
            }
          }}
          reportId={creatingFor.id}
          reportTitle={creatingFor.title}
        />
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choisir un rapport</DialogTitle>
            <DialogDescription>
              Le procès-verbal sera rattaché à ce rapport.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Rechercher un rapport…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2 space-y-1">
            {reportsQ.isLoading && (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-md" />
                ))}
              </div>
            )}
            {reportsQ.data && filteredReports.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucun rapport disponible.
              </div>
            )}
            {filteredReports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setPickerSearch("");
                  setCreatingFor({ id: r.id, title: r.title });
                }}
                className="w-full text-left rounded-md border border-border hover:border-primary hover:bg-accent transition-colors p-3"
              >
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(r.report_date), "d LLL yyyy", { locale: fr })} · Par{" "}
                  {r.author_name}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
      >
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
              onClick={() => confirmDel && del.mutate(confirmDel.id)}
            >
              {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
