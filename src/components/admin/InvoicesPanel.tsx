import { formatPrice } from "@/lib/currency";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInvoices, createInvoice, updateInvoiceStatus, deleteInvoice } from "@/lib/admin.functions";
import { listCompaniesAdmin } from "@/lib/platform.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Receipt, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatLongDate } from "@/lib/date-utils";

function eur(cents: number) {
  return formatPrice(cents);
}

const STATUSES = ["draft", "sent", "paid", "void", "overdue"] as const;
const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon", sent: "Envoyée", paid: "Payée", void: "Annulée", overdue: "En retard",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default", sent: "secondary", draft: "outline", overdue: "destructive", void: "outline",
};

export function InvoicesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvoices);
  const updateFn = useServerFn(updateInvoiceStatus);
  const delFn = useServerFn(deleteInvoice);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-invoices", statusFilter],
    queryFn: () => listFn({ data: statusFilter === "all" ? {} : { status: statusFilter } }),
  });

  const updateMut = useMutation({
    mutationFn: (p: { id: string; status: any }) => updateFn({ data: p }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Facture supprimée");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Factures ({rows.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <InvoiceDialog />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune facture.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-muted-foreground border-b [&_th]:whitespace-nowrap">
                <tr>
                  <th className="py-2">N°</th>
                  <th className="py-2">Entreprise</th>
                  <th className="py-2">Montant</th>
                  <th className="py-2">Période</th>
                  <th className="py-2">Échéance</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{r.number}</td>
                    <td className="py-2">{r.company_name}</td>
                    <td className="py-2 font-medium">{eur(r.amount_cents)}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {r.period_start ? formatLongDate(r.period_start) : "—"}
                      {r.period_end ? ` → ${formatLongDate(r.period_end)}` : ""}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {r.due_date ? formatLongDate(r.due_date) : "—"}
                    </td>
                    <td className="py-2">
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Select
                          value={r.status}
                          onValueChange={(v) => updateMut.mutate({ id: r.id, status: v })}
                        >
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" aria-label="Supprimer la facture"
                          onClick={() => { if (confirm(`Supprimer la facture ${r.number} ?`)) delMut.mutate(r.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceDialog() {
  const qc = useQueryClient();
  const companiesFn = useServerFn(listCompaniesAdmin);
  const createFn = useServerFn(createInvoice);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: "",
    amountEur: 0,
    periodStart: "",
    periodEnd: "",
    dueDate: "",
    notes: "",
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: () => companiesFn(),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          companyId: form.companyId,
          amountCents: Math.round(Number(form.amountEur) * 100),
          periodStart: form.periodStart || null,
          periodEnd: form.periodEnd || null,
          dueDate: form.dueDate || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Facture créée");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      setOpen(false);
      setForm({ companyId: "", amountEur: 0, periodStart: "", periodEnd: "", dueDate: "", notes: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nouvelle facture</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle facture</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Entreprise</Label>
            <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Montant (€)</Label>
            <Input type="number" min={0} step="0.01" value={form.amountEur}
              onChange={(e) => setForm({ ...form, amountEur: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Période début</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div>
              <Label>Période fin</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Échéance</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.companyId || form.amountEur <= 0}>
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
