import { formatPrice } from "@/lib/currency";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPlans, upsertPlan, deletePlan, type Plan } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function eur(cents: number) {
  return formatPrice(cents);
}

export function PlansPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlans);
  const delFn = useServerFn(deletePlan);
  const { data: plans = [] } = useQuery({ queryKey: ["admin-plans"], queryFn: () => listFn() });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Plan supprimé");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Plans & tarifs ({plans.length})
          </CardTitle>
          <PlanDialog />
        </div>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun plan.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{p.name}</span>
                      {!p.is_active && <Badge variant="secondary">Inactif</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">code : {p.code}</div>
                  </div>
                  <div className="flex gap-1">
                    <PlanDialog plan={p} />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Supprimer le plan « ${p.name} » ?`)) delMut.mutate(p.id);
                      }}
                      aria-label="Supprimer le plan"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{eur(p.monthly_price_cents)}</span>
                  <span className="text-xs text-muted-foreground">/ mois</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Annuel : {eur(p.yearly_price_cents)} · {p.seat_limit} sièges inclus
                  {p.price_per_extra_seat_cents > 0 && ` · +${eur(p.price_per_extra_seat_cents)}/siège supp.`}
                </div>
                {p.features.length > 0 && (
                  <ul className="text-sm space-y-1 pt-1">
                    {p.features.map((f, i) => (
                      <li key={i} className="text-muted-foreground">• {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanDialog({ plan }: { plan?: Plan }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertPlan);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    monthly_price_cents: plan?.monthly_price_cents ?? 0,
    yearly_price_cents: plan?.yearly_price_cents ?? 0,
    seat_limit: plan?.seat_limit ?? 3,
    price_per_extra_seat_cents: plan?.price_per_extra_seat_cents ?? 0,
    features: (plan?.features ?? []).join("\n"),
    is_active: plan?.is_active ?? true,
    sort_order: plan?.sort_order ?? 0,
  }));

  const mut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: plan?.id,
          code: form.code,
          name: form.name,
          description: form.description || null,
          monthly_price_cents: Number(form.monthly_price_cents),
          yearly_price_cents: Number(form.yearly_price_cents),
          seat_limit: Number(form.seat_limit),
          price_per_extra_seat_cents: Number(form.price_per_extra_seat_cents),
          features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
          is_active: form.is_active,
          sort_order: Number(form.sort_order),
        },
      }),
    onSuccess: () => {
      toast.success(plan ? "Plan mis à jour" : "Plan créé");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {plan ? (
          <Button size="icon" variant="ghost" aria-label="Modifier le plan"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nouveau plan</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{plan ? "Modifier le plan" : "Nouveau plan"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="pro" />
            </div>
            <div>
              <Label>Nom</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Prix mensuel (€)</Label>
              <Input type="number" min={0} step="0.01" value={form.monthly_price_cents / 100}
                onChange={(e) => setForm({ ...form, monthly_price_cents: Math.round(Number(e.target.value) * 100) })} />
            </div>
            <div>
              <Label>Prix annuel (€)</Label>
              <Input type="number" min={0} step="0.01" value={form.yearly_price_cents / 100}
                onChange={(e) => setForm({ ...form, yearly_price_cents: Math.round(Number(e.target.value) * 100) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Sièges inclus</Label>
              <Input type="number" min={1} value={form.seat_limit}
                onChange={(e) => setForm({ ...form, seat_limit: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Prix par siège supp. (€)</Label>
              <Input type="number" min={0} step="0.01" value={form.price_per_extra_seat_cents / 100}
                onChange={(e) => setForm({ ...form, price_per_extra_seat_cents: Math.round(Number(e.target.value) * 100) })} />
            </div>
          </div>
          <div>
            <Label>Fonctionnalités (une par ligne)</Label>
            <Textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Actif</Label>
            </div>
            <div className="flex-1">
              <Label>Ordre</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.code || !form.name}>
            {plan ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
