import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Loader2, Plus, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/planning")({
  head: () => ({
    meta: [
      { title: "Planning — DailyBrief" },
      {
        name: "description",
        content: "Planifiez les travaux à venir : la journée, la semaine ou le mois.",
      },
      { property: "og:title", content: "Planning — DailyBrief" },
      { property: "og:description", content: "Les travaux à venir, jour par jour." },
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
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const monthTitle = (d: Date) => {
  const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function covers(item: PlanItem, dayIso: string): boolean {
  const end = item.end_date ?? item.planned_date;
  return item.planned_date <= dayIso && end >= dayIso;
}

const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: "Prévu",
  in_progress: "En cours",
  done: "Terminé",
  cancelled: "Annulé",
};

const PRIORITY_TONE: Record<PlanPriority, string> = {
  normal: "border-l-border",
  high: "border-l-amber-500",
  urgent: "border-l-destructive",
};

/* -------------------------------- page ---------------------------------- */

function PlanningPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlanItems);
  const createFn = useServerFn(createPlanItem);
  const updateFn = useServerFn(updatePlanItem);
  const deleteFn = useServerFn(deletePlanItem);
  const membersFn = useServerFn(listActionMembers);

  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const range = useMemo(() => {
    if (view === "week") {
      const from = startOfWeek(anchor);
      return { from: iso(from), to: iso(addDays(from, 6)), days: 7, start: from };
    }
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    return { from: iso(gridStart), to: iso(addDays(gridStart, 41)), days: 42, start: gridStart };
  }, [view, anchor]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["plan-items", range.from, range.to],
    queryFn: () => listFn({ data: { from: range.from, to: range.to } }),
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
      toast.success("Élément supprimé");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  const days = useMemo(
    () => Array.from({ length: range.days }, (_, i) => iso(addDays(range.start, i))),
    [range],
  );

  const today = iso(new Date());

  function move(direction: -1 | 1) {
    if (view === "week") setAnchor((d) => addDays(d, direction * 7));
    else
      setAnchor((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1)));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarDays className="h-5 w-5 text-primary" />
          Planning
        </h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(-1)} aria-label="Période précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setAnchor(new Date())}
            >
              Aujourd'hui
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(1)} aria-label="Période suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex rounded-lg border p-0.5">
            {(["week", "month"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? "default" : "ghost"}
                className="h-8 px-3 text-xs"
                onClick={() => setView(v)}
              >
                {v === "week" ? "Semaine" : "Mois"}
              </Button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
            <FileText className="h-4 w-4 mr-1.5" />
            Bilan
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau
          </Button>
        </div>
      </div>

      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold">
          {view === "week"
            ? `Semaine du ${new Date(range.from + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}`
            : monthTitle(anchor)}
        </h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">
          {items.length} élément{items.length > 1 ? "s" : ""}
        </span>
      </div>

      <div
        className={
          view === "week"
            ? "grid gap-3 md:grid-cols-7"
            : "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
        }
      >
        {days.map((day, index) => {
          const dayItems = items.filter((item) => covers(item, day));
          const isToday = day === today;
          const inMonth = view === "week" || day.slice(0, 7) === iso(anchor).slice(0, 7);

          return (
            <div
              key={day}
              className={`min-h-[120px] rounded-xl border p-2 ${
                isToday ? "border-primary/60 bg-primary/[0.03]" : "bg-card"
              } ${inMonth ? "" : "opacity-50"}`}
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {DAY_LABELS[index % 7]}
                </span>
                <span className={`text-sm tabular-nums ${isToday ? "font-bold text-primary" : ""}`}>
                  {Number(day.slice(8, 10))}
                </span>
              </div>

              <div className="space-y-1.5">
                {dayItems.map((item) => (
                  <button
                    key={`${day}-${item.id}`}
                    type="button"
                    onClick={() => { setEditing(item); setDialogOpen(true); }}
                    className={`block w-full rounded-md border border-l-2 bg-background px-2 py-1.5 text-left transition hover:bg-muted/60 ${PRIORITY_TONE[item.priority]} ${
                      item.status === "done" || item.status === "cancelled" ? "opacity-60" : ""
                    }`}
                  >
                    <span
                      className={`block truncate text-[12px] font-medium ${
                        item.status === "done" ? "line-through" : ""
                      }`}
                    >
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {item.owner_name}
                    </span>
                  </button>
                ))}

                {dayItems.length === 0 && view === "week" && (
                  <p className="px-1 text-[11px] text-muted-foreground/60">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <PlanItemDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        item={editing}
        defaultDate={today}
        members={members}
        onSaved={invalidate}
        onDelete={(id) => { remove.mutate(id); setDialogOpen(false); }}
        onStatus={(id, status) => update.mutate({ id, status })}
      />

      <PlanSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        items={items}
        from={range.from}
        to={range.to}
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Non assigné</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as PlanPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
