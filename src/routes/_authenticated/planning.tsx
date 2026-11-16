import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  createPlanItem,
  deletePlanItem,
  listPlanItems,
  updatePlanItem,
  type PlanItem,
  type PlanPriority,
  type PlanStatus,
} from "@/lib/planning/planning.functions";
import { listActionMembers } from "@/lib/actions/actions.functions";
import { PlanSummaryDialog } from "@/components/planning/PlanSummaryDialog";
import { PlanDocumentDialog } from "@/components/planning/PlanDocumentDialog";
import { PlanDraftDialog } from "@/components/planning/PlanDraftDialog";

export const Route = createFileRoute("/_authenticated/planning")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      {
        name: "description",
        content: "Planifiez les travaux d'une période et produisez le plan ou le bilan.",
      },
      { property: "og:title", content: "Planning — DailyBrief" },
      { property: "og:description", content: "Les travaux d'une période, du plan au bilan." },
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
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const endOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

const shortDate = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const longDate = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: "Prévu",
  in_progress: "En cours",
  done: "Terminé",
  cancelled: "Annulé",
};

const STATUS_CLASS: Record<PlanStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive",
};

const PRIORITY_CLASS: Record<PlanPriority, string> = {
  normal: "border-l-border",
  high: "border-l-amber-500",
  urgent: "border-l-destructive",
};

/* -------------------------------- page ---------------------------------- */

function PlanningPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlanItems);
  const updateFn = useServerFn(updatePlanItem);
  const deleteFn = useServerFn(deletePlanItem);
  const membersFn = useServerFn(listActionMembers);

  const [from, setFrom] = useState(() => iso(startOfWeek(new Date())));
  const [to, setTo] = useState(() => iso(addDays(startOfWeek(new Date()), 6)));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [planDocOpen, setPlanDocOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);

  const validRange = !!from && !!to && from <= to;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["plan-items", from, to],
    queryFn: () => listFn({ data: { from, to } }),
    enabled: validRange,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["action-members"],
    queryFn: () => membersFn(),
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plan-items"] });

  const update = useMutation({
    mutationFn: (v: { id: string; status: PlanStatus }) => updateFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Modification impossible"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Travail supprimé");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  const today = iso(new Date());

  /** Une seule liste pour la période, triée par date de début. */
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
    [items],
  );

  const done = items.filter((i) => i.status === "done").length;
  const rate = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  function preset(kind: "week" | "month") {
    if (kind === "week") {
      const start = startOfWeek(new Date());
      setFrom(iso(start));
      setTo(iso(addDays(start, 6)));
    } else {
      setFrom(iso(startOfMonth(new Date())));
      setTo(iso(endOfMonth(new Date())));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            Planning
          </h1>
          <p className="text-sm text-muted-foreground">
            Les travaux d'une période — puis son plan ou son bilan.
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDraftOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Planifier avec l'assistant
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Planifier un travail
          </Button>
        </div>
      </div>

      {/* La période */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="period-from" className="text-xs">Du</Label>
            <Input
              id="period-from"
              type="date"
              className="h-9 w-[150px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-to" className="text-xs">Au</Label>
            <Input
              id="period-to"
              type="date"
              className="h-9 w-[150px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 pb-0.5">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => preset("week")}>
              Cette semaine
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => preset("month")}>
              Ce mois
            </Button>
          </div>

          {isLoading && <Loader2 className="mb-1.5 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {!validRange ? (
          <p className="text-xs text-destructive">La date de fin doit suivre la date de début.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {items.length} travail{items.length > 1 ? "x" : ""} · {done} terminé
            {done > 1 ? "s" : ""}
            {items.length > 0 ? ` · ${rate} % réalisé` : ""}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlanDocOpen(true)}
            disabled={items.length === 0}
          >
            <FileText className="h-4 w-4 mr-2" />
            Plan à imprimer
          </Button>
          <Button size="sm" onClick={() => setSummaryOpen(true)} disabled={items.length === 0}>
            <Sparkles className="h-4 w-4 mr-2" />
            Bilan de la période
          </Button>
        </div>
      </div>

      {/* Liste unique de la période */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Aucun travail sur cette période</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoutez ce qui doit être fait, puis générez le plan ou le bilan.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const spans = item.end_date && item.end_date !== item.planned_date;
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-lg border border-l-2 bg-card px-3 py-2.5 ${PRIORITY_CLASS[item.priority]}`}
              >
                <div className="w-20 shrink-0 pt-0.5">
                  <p className="text-[11px] font-medium uppercase text-muted-foreground">
                    {shortDate(item.planned_date)}
                  </p>
                  {spans && (
                    <p className="text-[10px] text-muted-foreground">
                      → {shortDate(item.end_date!)}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setEditing(item);
                    setDialogOpen(true);
                  }}
                >
                  <p
                    className={`truncate text-sm font-medium ${
                      item.status === "done" ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.owner_name}
                    {item.details ? ` · ${item.details}` : ""}
                  </p>
                </button>

                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <PlanItemDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        item={editing}
        defaultDate={today}
        members={members}
        onSaved={invalidate}
        onDelete={(id) => {
          remove.mutate(id);
          setDialogOpen(false);
        }}
        onStatus={(id, status) => update.mutate({ id, status })}
      />

      <PlanSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        initialFrom={from}
        initialTo={to}
      />

      <PlanDocumentDialog
        open={planDocOpen}
        onOpenChange={setPlanDocOpen}
        initialFrom={from}
        initialTo={to}
      />

      <PlanDraftDialog
        open={draftOpen}
        onOpenChange={setDraftOpen}
        initialFrom={from}
        initialTo={to}
        onCreated={invalidate}
      />
    </div>
  );
}

/* ------------------------------- dialogue -------------------------------- */

function PlanItemDialog({
  open,
  onOpenChange,
  item,
  defaultDate,
  members,
  onSaved,
  onDelete,
  onStatus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: PlanItem | null;
  defaultDate: string;
  members: { id: string; name: string }[];
  onSaved: () => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, status: PlanStatus) => void;
}) {
  const createFn = useServerFn(createPlanItem);
  const updateFn = useServerFn(updatePlanItem);

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [plannedDate, setPlannedDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState("");
  const [ownerId, setOwnerId] = useState("__none__");
  const [priority, setPriority] = useState<PlanPriority>("normal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setTitle(item.title);
      setDetails(item.details);
      setPlannedDate(item.planned_date);
      setEndDate(item.end_date ?? "");
      setOwnerId(item.owner_id ?? "__none__");
      setPriority(item.priority);
    } else {
      setTitle("");
      setDetails("");
      setPlannedDate(defaultDate);
      setEndDate("");
      setOwnerId("__none__");
      setPriority("normal");
    }
  }, [open, item, defaultDate]);

  async function save() {
    if (title.trim().length < 2) {
      toast.error("Donnez un titre à ce travail.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        details,
        plannedDate,
        endDate: endDate || null,
        ownerId: ownerId === "__none__" ? null : ownerId,
        priority,
      };
      if (item) await updateFn({ data: { id: item.id, ...payload } });
      else await createFn({ data: payload });
      toast.success(item ? "Planning mis à jour" : "Travail planifié");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Modifier le planning" : "Planifier un travail"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-title">Travail à réaliser</Label>
            <Input
              id="plan-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Coulage dalle bâtiment B"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-details">Détails (facultatif)</Label>
            <Textarea
              id="plan-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              placeholder="Matériel, équipe, conditions…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-date">Du</Label>
              <Input
                id="plan-date"
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-end">Au (facultatif)</Label>
              <Input
                id="plan-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Non assigné</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as PlanPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="high">Importante</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {item && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {(Object.keys(STATUS_LABEL) as PlanStatus[]).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={item.status === status ? "default" : "outline"}
                  className="h-8"
                  onClick={() => onStatus(item.id, status)}
                >
                  {STATUS_LABEL[status]}
                </Button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {item && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {item ? "Enregistrer" : "Planifier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
