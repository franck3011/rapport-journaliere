import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Target, Plus, Trash2, Loader2, TrendingUp } from "lucide-react";
import {
  createObjective,
  deleteObjective,
  listObjectives,
  updateObjective,
  type ObjectiveKind,
  type ObjectiveRow,
} from "@/lib/objectives/objectives.functions";
import { listActionMembers } from "@/lib/actions/actions.functions";

export const Route = createFileRoute("/_authenticated/objectives")({
  head: () => ({
    meta: [
      { title: "Objectifs — DailyBrief" },
      {
        name: "description",
        content: "Suivez le réalisé face aux objectifs fixés, par personne ou pour l'entreprise.",
      },
      { property: "og:title", content: "Objectifs — DailyBrief" },
      { property: "og:description", content: "Réalisé vs cible, par équipe et par période." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObjectivesPage,
});

function monthBounds(offset = 0) {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

function periodLabel(start: string, end: string) {
  const d = new Date(start + "T00:00:00Z");
  const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function barTone(p: number) {
  if (p >= 1) return "bg-emerald-500";
  if (p >= 0.7) return "bg-amber-500";
  return "bg-primary";
}

function ObjectivesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listObjectives);
  const createFn = useServerFn(createObjective);
  const updateFn = useServerFn(updateObjective);
  const deleteFn = useServerFn(deleteObjective);
  const membersFn = useServerFn(listActionMembers);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ObjectiveKind>("manual");
  const [ownerId, setOwnerId] = useState<string>("__all__");
  const [target, setTarget] = useState("10");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["objectives"],
    queryFn: () => listFn(),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["action-members"],
    queryFn: () => membersFn(),
    staleTime: 60_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ObjectiveRow[]>();
    for (const o of rows) {
      const key = `${o.period_start}|${o.period_end}`;
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const updateMut = useMutation({
    mutationFn: (v: { id: string; currentValue: number }) =>
      updateFn({ data: { id: v.id, currentValue: v.currentValue } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["objectives"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Modification impossible"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Objectif supprimé");
      await qc.invalidateQueries({ queryKey: ["objectives"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  async function handleCreate() {
    if (title.trim().length < 3) {
      toast.error("Donnez un intitulé à l'objectif.");
      return;
    }
    const value = Number(target.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("La cible doit être un nombre supérieur à 0.");
      return;
    }
    setSaving(true);
    try {
      const { start, end } = monthBounds(0);
      await createFn({
        data: {
          title: title.trim(),
          kind,
          ownerId: ownerId === "__all__" ? null : ownerId,
          targetValue: value,
          currentValue: 0,
          unit,
          periodStart: start,
          periodEnd: end,
        },
      });
      toast.success("Objectif créé");
      setOpen(false);
      setTitle("");
      setTarget("10");
      setUnit("");
      setOwnerId("__all__");
      setKind("manual");
      await qc.invalidateQueries({ queryKey: ["objectives"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Création impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Objectifs
          </h1>
          <p className="text-sm text-muted-foreground">
            Le réalisé face à la cible, par personne ou pour toute l'entreprise.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel objectif
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Chargement…</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Target className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">Aucun objectif défini</p>
            <p className="text-sm text-muted-foreground">
              Fixez une cible à votre équipe : nombre de rapports, chiffre d'affaires, incidents…
            </p>
          </CardContent>
        </Card>
      ) : (
        grouped.map(([key, items]) => {
          const [start, end] = key.split("|");
          return (
            <div key={key} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {periodLabel(start, end)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((o) => (
                  <ObjectiveCard
                    key={o.id}
                    row={o}
                    onUpdate={(v) => updateMut.mutate({ id: o.id, currentValue: v })}
                    onDelete={() => deleteMut.mutate(o.id)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvel objectif</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="obj-title">Intitulé</Label>
              <Input
                id="obj-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. Rapports soumis, Chiffre d'affaires"
                maxLength={160}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mesure</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as ObjectiveKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reports">Nombre de rapports (auto)</SelectItem>
                    <SelectItem value="manual">Valeur saisie à la main</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pour</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toute l'entreprise</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="obj-target">Cible</Label>
                <Input
                  id="obj-target"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obj-unit">Unité (facultatif)</Label>
                <Input
                  id="obj-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="rapports, FCFA, %"
                  maxLength={20}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              L'objectif s'applique au mois en cours. Les objectifs « nombre de rapports »
              se mettent à jour automatiquement.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ObjectiveCard({
  row,
  onUpdate,
  onDelete,
}: {
  row: ObjectiveRow;
  onUpdate: (v: number) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(String(row.actual_value));
  const pct = Math.round(Math.min(1.5, row.progress) * 100);

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{row.title}</div>
            <div className="text-xs text-muted-foreground">{row.owner_name}</div>
          </div>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Supprimer">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {row.actual_value >= 1 ? Math.round(row.actual_value * 10) / 10 : row.actual_value}
          </span>
          <span className="text-sm text-muted-foreground">
            / {row.target_value} {row.unit}
          </span>
          <Badge variant="secondary" className="ml-auto">
            {pct >= 100 ? "Atteint" : `${pct} %`}
          </Badge>
        </div>

        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={"h-full rounded-full " + barTone(row.progress)} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>

        {row.kind === "manual" ? (
          <div className="flex items-center gap-2 pt-1">
            <Input
              className="h-8"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const v = Number(draft.replace(",", "."));
                if (!Number.isFinite(v) || v < 0) { toast.error("Valeur invalide"); return; }
                onUpdate(v);
              }}
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Mettre à jour
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground pt-1">
            Calculé automatiquement depuis les rapports de la période.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
