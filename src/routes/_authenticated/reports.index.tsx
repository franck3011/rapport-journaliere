import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listReports, deleteReport, getReport } from "@/lib/reports.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatLongDate } from "@/lib/date-utils";
import { downloadReportPdf, shareReportPdf, downloadReportsBundle } from "@/lib/pdf-utils";
import {
  Plus,
  FileText,
  Download,
  Share2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Search,
  ChevronDown,
  ShieldCheck,
  Layers,
  Loader2,
  FileDown,

  
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRoleAudit } from "@/lib/role-audit.functions";
import { levelLabel } from "@/lib/reports.types";
import { cn } from "@/lib/utils";
import { MonthlyReportButton } from "@/components/MonthlyReportButton";
import { downloadCsv, fileStamp } from "@/lib/export-csv";
import { CombineMonthsButton } from "@/components/CombineMonthsButton";
import { CombineDaysButton } from "@/components/CombineDaysButton";
import { parseISO, format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Rapports journaliers — Lovable Rapports" },
      {
        name: "description",
        content: "Tous les rapports d'activités de votre équipe, triés par date.",
      },
    ],
  }),
  component: ReportsListPage,
});

function ReportsListPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listReports);
  const fetchOne = useServerFn(getReport);
  const del = useServerFn(deleteReport);

  const query = useQuery({
    queryKey: ["reports"],
    queryFn: () => list(),
  });

  const [toDelete, setToDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [monthFrom, setMonthFrom] = useState<string>("all");
  const [monthTo, setMonthTo] = useState<string>("all");

  const auditFn = useServerFn(getRoleAudit);
  const roleQuery = useQuery({
    queryKey: ["role-audit"],
    queryFn: () => auditFn(),
    staleTime: 60_000,
  });
  const role = roleQuery.data ?? null;
  const roleActions = role
    ? [
        "Voir",
        ...(role.permissions.validate ? ["Valider"] : []),
        role.permissions.delete_own ? "Supprimer (les miens)" : "",
      ].filter(Boolean)
    : [];

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    (query.data ?? []).forEach((r) => keys.add(r.report_date.slice(0, 7)));
    return Array.from(keys)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => {
        const label = format(parseISO(`${key}-01`), "LLLL yyyy", { locale: fr });
        return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
      });
  }, [query.data]);

  const filtered = useMemo(() => {
    const rows = query.data ?? [];
    const q = search.trim().toLowerCase();
    const lo = monthFrom !== "all" && monthTo !== "all" && monthTo < monthFrom ? monthTo : monthFrom;
    const hi = monthFrom !== "all" && monthTo !== "all" && monthTo < monthFrom ? monthFrom : monthTo;
    return rows.filter((r) => {
      const m = r.report_date.slice(0, 7);
      if (lo !== "all" && m < lo) return false;
      if (hi !== "all" && m > hi) return false;
      if (scope === "mine" && r.author_id !== user.id) return false;
      if (!q) return true;
      return [r.title, r.intro, r.author_name]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [query.data, search, scope, user.id, monthFrom, monthTo]);

  const summaries = useMemo(
    () => filtered.filter((r) => r.period_start && r.period_end),
    [filtered],
  );
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: typeof filtered }>();
    for (const r of filtered) {
      const d = parseISO(r.report_date);
      const key = format(d, "yyyy-MM");
      const label = format(d, "LLLL yyyy", { locale: fr });
      const cap = label.charAt(0).toUpperCase() + label.slice(1);
      if (!map.has(key)) map.set(key, { label: cap, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, v]) => ({ key, ...v }));
  }, [filtered]);

  const currentMonthKey = format(new Date(), "yyyy-MM");
  const OPEN_MONTHS_KEY = "reports:openMonths";
  const [openMonths, setOpenMonths] = useState<Set<string>>(
    () => new Set([currentMonthKey]),
  );
  const [monthsRestored, setMonthsRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_MONTHS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOpenMonths(new Set(parsed.filter((k) => typeof k === "string")));
      }
    } catch {
      // préférence illisible : on garde le mois en cours ouvert
    }
    setMonthsRestored(true);
  }, []);

  useEffect(() => {
    if (!monthsRestored) return;
    try {
      localStorage.setItem(OPEN_MONTHS_KEY, JSON.stringify(Array.from(openMonths)));
    } catch {
      // stockage indisponible : la préférence n'est pas persistée
    }
  }, [openMonths, monthsRestored]);
  const isSearching = search.trim().length > 0;

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }




  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Rapport supprimé");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  async function handleDownloadOne(id: string) {
    try {
      const r = await fetchOne({ data: { id } });
      await downloadReportPdf(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    }
  }

  async function handleShareOne(id: string) {
    try {
      const r = await fetchOne({ data: { id } });
      await shareReportPdf(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Partage impossible");
    }
  }

  async function handleBulkDownload() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const reports = await Promise.all(
        Array.from(selected).map((id) => fetchOne({ data: { id } })),
      );
      await downloadReportsBundle(reports);
      toast.success(`${reports.length} rapport(s) téléchargé(s)`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    } finally {
      setBulkLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <div className="grid grid-cols-1 gap-4 mb-8 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Rapports journaliers</h1>
          <p className="text-muted-foreground mt-1">
            Consultez tous les rapports de l'équipe, triés par date.
          </p>
          {role && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                {levelLabel(role.my_level)}
                {role.is_owner ? " · Propriétaire" : ""}
              </Badge>
              {roleActions.map((a) => (
                <Badge key={a} variant="outline">
                  {a}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              onClick={handleBulkDownload}
              disabled={bulkLoading}
            >
              <Download className="h-4 w-4 mr-2" />
              Télécharger ({selected.size})
            </Button>
          )}
          <MonthlyReportButton monthKey={currentMonthKey} variant="outline" />
          <CombineMonthsButton />
          <CombineDaysButton />
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                `rapports-${fileStamp()}.csv`,
                ["Date", "Titre", "Auteur", "Statut", "Type", "Numéro"],
                filtered.map((r: any) => [
                  r.report_date,
                  r.title,
                  r.author_name,
                  r.status ?? "",
                  r.doc_type ?? "report",
                  r.doc_number ?? "",
                ]),
              )
            }
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button asChild>
            <Link to="/reports/new" search={{}}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rapport
            </Link>
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
            placeholder="Rechercher par titre, intro ou auteur…"
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
            Mes rapports
          </button>
        </div>
        {monthOptions.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={monthFrom} onValueChange={setMonthFrom}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Depuis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Depuis le début</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden text-sm text-muted-foreground sm:inline">→</span>
            <Select value={monthTo} onValueChange={setMonthTo}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Jusqu'à" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Jusqu'à aujourd'hui</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(monthFrom !== "all" || monthTo !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonthFrom("all");
                  setMonthTo("all");
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        )}
      </div>

      {query.isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {query.isError && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Impossible de charger les rapports.
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Aucun rapport pour le moment</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Créez votre premier rapport d'activité.
            </p>
            <Button asChild>
              <Link to="/reports/new" search={{}}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau rapport
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length > 0 && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun rapport ne correspond aux filtres sélectionnés.
          </CardContent>
        </Card>
      )}

      {summaries.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 pb-2 border-b border-border flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
            <Layers className="h-4 w-4 text-primary" />
            Rapports combinés
            <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
              ({summaries.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map((r) => (
              <Card key={r.id} className="flex flex-col border-primary/30">
                <CardContent className="p-5 flex flex-col flex-1 gap-2">
                  <Badge variant="secondary" className="w-fit">
                    Du {formatLongDate(r.period_start!)} au {formatLongDate(r.period_end!)}
                  </Badge>
                  <Link
                    to="/reports/$id"
                    params={{ id: r.id }}
                    className="font-semibold leading-snug hover:text-primary transition-colors line-clamp-2"
                  >
                    {r.title}
                  </Link>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/reports/$id" params={{ id: r.id }}>
                        <Eye className="h-4 w-4 mr-1.5" />
                        Voir
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      disabled={downloadingId === r.id}
                      onClick={async () => {
                        setDownloadingId(r.id);
                        try {
                          await handleDownloadOne(r.id);
                        } finally {
                          setDownloadingId(null);
                        }
                      }}
                    >
                      {downloadingId === r.id ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-1.5" />
                      )}
                      {downloadingId === r.id ? "Préparation…" : "Télécharger PDF"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {grouped.map((group) => {
        const isOpen = isSearching || openMonths.has(group.key);
        return (
        <section key={group.key} className="mb-10">
          <h2 className="mb-3 pb-2 border-b border-border flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleMonth(group.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  !isOpen && "-rotate-90",
                )}
              />
              {group.label}
              <span className="text-xs font-normal normal-case tracking-normal">
                ({group.items.length})
              </span>
              {!isOpen && (
                <span className="ml-auto text-xs font-normal normal-case tracking-normal">
                  Afficher
                </span>
              )}
            </button>
            <MonthlyReportButton monthKey={group.key} size="sm" variant="ghost" />
          </h2>
          {isOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">


            {group.items.map((r) => {
              const isMine = r.author_id === user.id;
              const isSel = selected.has(r.id);
              return (
                <Card
                  key={r.id}
                  className={cn(
                    "group transition-shadow hover:shadow-md relative flex flex-col",
                    isSel && "ring-2 ring-primary",
                  )}
                >
                  <CardContent className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggle(r.id)}
                          aria-label="Sélectionner"
                        />
                        <span className="text-xs font-medium text-primary">
                          {formatLongDate(r.report_date)}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions sur le rapport">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                to: "/reports/$id",
                                params: { id: r.id },
                              })
                            }
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Voir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadOne(r.id)}>
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShareOne(r.id)}>
                            <Share2 className="h-4 w-4 mr-2" />
                            Partager
                          </DropdownMenuItem>
                          {isMine && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate({
                                    to: "/reports/$id/edit",
                                    params: { id: r.id },
                                  })
                                }
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setToDelete(r.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Supprimer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Link
                      to="/reports/$id"
                      params={{ id: r.id }}
                      className="text-lg font-semibold leading-snug hover:text-primary transition-colors line-clamp-2"
                    >
                      {r.title}
                    </Link>
                    {r.intro && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2 flex-1">
                        {r.intro}
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                      <div>
                        Par <span className="font-medium text-foreground">{r.author_name}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          )}
        </section>
        );
      })}



      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce rapport ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le rapport et toutes ses images seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && deleteMut.mutate(toDelete)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
