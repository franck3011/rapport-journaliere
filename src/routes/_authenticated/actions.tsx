import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListChecks, Plus, Pencil, Trash2, AlertTriangle, CalendarClock, CalendarDays, Download } from "lucide-react";
import {
  deleteAction,
  listActions,
  updateAction,
  type ActionRow,
  type ActionStatus,
} from "@/lib/actions/actions.functions";
import { ActionDialog } from "@/components/actions/ActionDialog";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, fileStamp } from "@/lib/export-csv";

export const Route = createFileRoute("/_authenticated/actions")({
  head: () => ({
    meta: [
      { title: "Actions — DailyBrief" },
      {
        name: "description",
        content: "Suivez les décisions issues des rapports : qui fait quoi, pour quand.",
      },
      { property: "og:title", content: "Actions — DailyBrief" },
      { property: "og:description", content: "Relevé de décisions et suivi des actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActionsPage,
});

type Scope = "mine" | "team" | "company";

const STATUS_LABELS: Record<ActionStatus, string> = {
  todo: "À faire",
  doing: "En cours",
  done: "Terminée",
  cancelled: "Annulée",
};

const PRIORITY_TONES: Record<string, string> = {
  normal: "bg-muted text-muted-foreground",
  high: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  urgent: "bg-destructive/10 text-destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  normal: "Normale",
  high: "Importante",
  urgent: "Urgente",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function inSevenDaysStr() {
  return new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
}

function ActionsPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("mine");
  const [includeDone, setIncludeDone] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActionRow | null>(null);
  const [meId, setMeId] = useState<string>("");

  const listFn = useServerFn(listActions);
  const updateFn = useServerFn(updateAction);
  const deleteFn = useServerFn(deleteAction);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? ""));
  }, []);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["actions", scope, includeDone],
    queryFn: () => listFn({ data: { scope, includeDone } }),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: ActionStatus }) =>
      updateFn({ data: { id: v.id, status: v.status } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["actions"] });
      await qc.invalidateQueries({ queryKey: ["report-actions"] });
      await qc.invalidateQueries({ queryKey: ["actions-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Modification impossible"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Action supprimée");
      await qc.invalidateQueries({ queryKey: ["actions"] });
      await qc.invalidateQueries({ queryKey: ["report-actions"] });
      await qc.invalidateQueries({ queryKey: ["actions-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  const groups = useMemo(() => {
    const today = todayStr();
    const week = inSevenDaysStr();
    const late: ActionRow[] = [];
    const weekRows: ActionRow[] = [];
    const later: ActionRow[] = [];
    const noDate: ActionRow[] = [];
    const done: ActionRow[] = [];

    for (const r of rows) {
      if (r.status === "done" || r.status === "cancelled") { done.push(r); continue; }
      if (!r.due_date) { noDate.push(r); continue; }
      if (r.due_date < today) late.push(r);
      else if (r.due_date <= week) weekRows.push(r);
      else later.push(r);
    }
    return { late, weekRows, later, noDate, done };
  }, [rows]);

  const openCount = groups.late.length + groups.weekRows.length + groups.later.length + groups.noDate.length;

  function renderGroup(title: string, icon: React.ReactNode, items: ActionRow[], tone: string) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className={"flex items-center gap-2 text-sm font-medium " + tone}>
          {icon}
          <span>{title}</span>
          <Badge variant="secondary" className="ml-1">{items.length}</Badge>
        </div>
        <div className="space-y-2">
          {items.map((r) => (
            <ActionLine
              key={r.id}
              row={r}
              meId={meId}
              onStatus={(status) => statusMut.mutate({ id: r.id, status })}
              onEdit={() => { setEditing(r); setDialogOpen(true); }}
              onDelete={() => deleteMut.mutate(r.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Actions
          </h1>
          <p className="text-sm text-muted-foreground">
            Les décisions issues de vos rapports, suivies jusqu'à leur clôture.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                `actions-${fileStamp()}.csv`,
                ["Action", "Responsable", "Statut", "Priorité", "Échéance", "Rapport"],
                rows.map((r) => [
                  r.title,
                  r.owner_name,
                  STATUS_LABELS[r.status],
                  PRIORITY_LABELS[r.priority],
                  r.due_date ?? "",
                  r.report_title ?? "",
                ]),
              )
            }
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle action
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["mine", "team", "company"] as Scope[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={scope === s ? "default" : "outline"}
            onClick={() => setScope(s)}
          >
            {s === "mine" ? "Mes actions" : s === "team" ? "Mon équipe" : "Toutes"}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={includeDone} onCheckedChange={(v) => setIncludeDone(v === true)} />
          Afficher les terminées
        </label>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Chargement…</CardContent></Card>
      ) : openCount === 0 && groups.done.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <ListChecks className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">Aucune action pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Créez-en une ici, ou depuis un rapport via « Actions décidées ».
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {renderGroup("En retard", <AlertTriangle className="h-4 w-4" />, groups.late, "text-destructive")}
          {renderGroup("Cette semaine", <CalendarClock className="h-4 w-4" />, groups.weekRows, "text-amber-600 dark:text-amber-400")}
          {renderGroup("Plus tard", <CalendarDays className="h-4 w-4" />, groups.later, "text-muted-foreground")}
          {renderGroup("Sans échéance", <CalendarDays className="h-4 w-4" />, groups.noDate, "text-muted-foreground")}
          {includeDone && renderGroup("Terminées", <ListChecks className="h-4 w-4" />, groups.done, "text-emerald-600 dark:text-emerald-400")}
        </div>
      )}

      <ActionDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        action={editing}
        defaultOwnerId={meId}
      />
    </div>
  );
}

function ActionLine({
  row,
  meId,
  onStatus,
  onEdit,
  onDelete,
}: {
  row: ActionRow;
  meId: string;
  onStatus: (s: ActionStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = row.status === "done";
  const canDelete = row.created_by === meId || meId === "";

  return (
    <Card className={done ? "opacity-70" : undefined}>
      <CardContent className="p-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className={"font-medium truncate " + (done ? "line-through text-muted-foreground" : "")}>
            {row.title}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
            <span>{row.owner_name}</span>
            {row.due_date && (
              <>
                <span>·</span>
                <span className={row.is_late ? "text-destructive font-medium" : undefined}>
                  échéance {row.due_date}
                </span>
              </>
            )}
            {row.report_title && (
              <>
                <span>·</span>
                <Link
                  to="/reports/$id"
                  params={{ id: row.report_id! }}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {row.report_title}
                </Link>
              </>
            )}
          </div>
        </div>

        <Badge className={PRIORITY_TONES[row.priority]}>{PRIORITY_LABELS[row.priority]}</Badge>

        <Select value={row.status} onValueChange={(v) => onStatus(v as ActionStatus)}>
          <SelectTrigger className="w-[130px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as ActionStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Modifier">
          <Pencil className="h-4 w-4" />
        </Button>
        {canDelete && (
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Supprimer">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
