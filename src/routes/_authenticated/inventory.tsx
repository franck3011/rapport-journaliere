import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Boxes,
  Loader2,
  Plus,
  Trash2,
  Building2,
  Save,
} from "lucide-react";
import {
  createDepartment,
  deleteDepartment,
  deleteInventoryItem,
  listDepartments,
  listInventoryItems,
  saveInventoryItem,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [{ title: "Inventaire — DailyBrief" }, { name: "robots", content: "noindex" }],
  }),
  component: InventoryPage,
});

const STATUS_LABEL: Record<string, string> = {
  in_service: "En service",
  repair: "En réparation",
  retired: "Réformé",
  missing: "Manquant",
};

function InventoryPage() {
  const qc = useQueryClient();
  const listDept = useServerFn(listDepartments);
  const addDept = useServerFn(createDepartment);
  const removeDept = useServerFn(deleteDepartment);
  const listItems = useServerFn(listInventoryItems);
  const saveItem = useServerFn(saveInventoryItem);
  const removeItem = useServerFn(deleteInventoryItem);

  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [newDept, setNewDept] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: "",
    quantity: 1,
    serialNumber: "",
    status: "in_service",
  });

  const { data: departments = [], isLoading: loadingDepts } = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDept(),
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["inventory", departmentId],
    queryFn: () => listItems({ data: { departmentId } }),
  });

  const totals = useMemo(() => {
    const map: Record<string, number> = { in_service: 0, repair: 0, retired: 0, missing: 0 };
    for (const item of items as any[]) {
      map[item.status] = (map[item.status] ?? 0) + Number(item.quantity ?? 1);
    }
    return map;
  }, [items]);

  const deptMutation = useMutation({
    mutationFn: (name: string) => addDept({ data: { name } }),
    onSuccess: async () => {
      setNewDept("");
      toast.success("Département créé");
      await qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Création impossible"),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: (id: string) => removeDept({ data: { id } }),
    onSuccess: async () => {
      if (departmentId) setDepartmentId(null);
      toast.success("Département supprimé");
      await qc.invalidateQueries({ queryKey: ["departments"] });
      await qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Suppression impossible"),
  });

  const itemMutation = useMutation({
    mutationFn: () =>
      saveItem({
        data: {
          departmentId,
          name: form.name,
          category: form.category,
          quantity: Number(form.quantity) || 0,
          serialNumber: form.serialNumber,
          status: form.status as any,
        },
      }),
    onSuccess: async () => {
      setForm({ name: "", category: "", quantity: 1, serialNumber: "", status: "in_service" });
      toast.success("Matériel enregistré");
      await qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Enregistrement impossible"),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => removeItem({ data: { id } }),
    onSuccess: async () => {
      toast.success("Ligne supprimée");
      await qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Suppression impossible"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Boxes className="h-5 w-5 text-primary" />
          Inventaire
        </h1>
        <p className="text-sm text-muted-foreground">
          Le matériel de l'entreprise, rangé par département.
        </p>
      </header>

      {/* Départements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Départements
          </CardTitle>
          <CardDescription>
            Un département regroupe le matériel d'un service (informatique, atelier, logistique…).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={departmentId === null ? "default" : "outline"}
              onClick={() => setDepartmentId(null)}
            >
              Tous les départements
            </Button>
            {(departments as any[]).map((dept) => (
              <div key={dept.id} className="flex items-center">
                <Button
                  size="sm"
                  variant={departmentId === dept.id ? "default" : "outline"}
                  onClick={() => setDepartmentId(dept.id)}
                  className="rounded-r-none"
                >
                  {dept.name}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-l-none border-l-0 px-2"
                  onClick={() => {
                    if (confirm(`Supprimer le département « ${dept.name} » ? Le matériel sera conservé, non affecté.`)) {
                      deleteDeptMutation.mutate(dept.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Nom du département"
              value={newDept}
              onChange={(event) => setNewDept(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newDept.trim().length >= 2) {
                  deptMutation.mutate(newDept.trim());
                }
              }}
            />
            <Button
              variant="outline"
              disabled={newDept.trim().length < 2 || deptMutation.isPending}
              onClick={() => deptMutation.mutate(newDept.trim())}
            >
              {deptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Synthèse */}
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold tabular-nums">{totals[key] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ajout */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ajouter du matériel</CardTitle>
          <CardDescription>
            Rattaché au département sélectionné, ou « non affecté » si aucun n'est choisi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              placeholder="Désignation (ex. HP ProBook)"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              placeholder="Catégorie"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            />
            <Input
              type="number"
              min={0}
              placeholder="Quantité"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
            />
            <Input
              placeholder="N° de série"
              value={form.serialNumber}
              onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              disabled={form.name.trim().length === 0 || itemMutation.isPending}
              onClick={() => itemMutation.mutate()}
            >
              {itemMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Matériel {departmentId ? "du département sélectionné" : "de l'entreprise"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(loadingItems || loadingDepts) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          )}

          {!loadingItems && items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun matériel enregistré pour l'instant.
            </p>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-semibold">Désignation</th>
                    <th className="px-2 py-2 text-left font-semibold">Catégorie</th>
                    <th className="px-2 py-2 text-left font-semibold">Département</th>
                    <th className="px-2 py-2 text-right font-semibold">Qté</th>
                    <th className="px-2 py-2 text-left font-semibold">État</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(items as any[]).map((item) => {
                    const dept = (departments as any[]).find((d) => d.id === item.department_id);
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-2 py-2">
                          {item.name}
                          {item.serial_number && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {item.serial_number}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{item.category || "—"}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {dept?.name ?? "Non affecté"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-2 py-2">{STATUS_LABEL[item.status] ?? item.status}</td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteItemMutation.mutate(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
