import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  checkIsPlatformAdmin,
  getAdminAccessStatus,
  listCompaniesAdmin,
  updateSeatLimit,
  listPlatformAdmins,
  addPlatformAdmin,
  removePlatformAdmin,
} from "@/lib/platform.functions";
import { MfaGate } from "@/components/admin/MfaGate";
import {
  listReservedNames,
  addReservedName,
  removeReservedName,
} from "@/lib/reserved-names.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, ShieldAlert, Trash2, Plus, Users, Lock, LayoutDashboard, Package, Receipt, ScrollText, UserCog, Bug } from "lucide-react";
import { ErrorsPanel } from "@/components/admin/ErrorsPanel";
import { toast } from "sonner";
import { formatLongDate } from "@/lib/date-utils";
import { DashboardPanel } from "@/components/admin/DashboardPanel";
import { PlansPanel } from "@/components/admin/PlansPanel";
import { InvoicesPanel } from "@/components/admin/InvoicesPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { AuditPanel } from "@/components/admin/AuditPanel";


export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getAdminAccessStatus);
  const { data: status, isLoading } = useQuery({
    queryKey: ["admin-access-status"],
    queryFn: () => statusFn(),
  });

  useEffect(() => {
    if (!isLoading && status && !status.isAdmin) navigate({ to: "/reports" });
  }, [status, isLoading, navigate]);

  async function handleMfaVerified() {
    // Le SDK a déjà persisté un JWT aal2. Rafraîchir la vue admin.
    await queryClient.invalidateQueries({ queryKey: ["admin-access-status"] });
  }

  if (isLoading) return <div className="p-8">Chargement...</div>;
  if (!status?.isAdmin) return null;

  if (!status.mfaVerified) {
    return (
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" /> Administration plateforme
          </h1>
          <p className="text-sm text-muted-foreground">
            Validation de la double authentification requise.
          </p>
        </header>
        <MfaGate onVerified={handleMfaVerified} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> Administration plateforme
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez les entreprises, leurs sièges, et les super administrateurs.
        </p>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
          <TabsTrigger value="companies"><Users className="h-4 w-4 mr-1" />Entreprises</TabsTrigger>
          <TabsTrigger value="users"><UserCog className="h-4 w-4 mr-1" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="plans"><Package className="h-4 w-4 mr-1" />Plans</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt className="h-4 w-4 mr-1" />Factures</TabsTrigger>
          
          <TabsTrigger value="reserved"><Lock className="h-4 w-4 mr-1" />Noms réservés</TabsTrigger>
          <TabsTrigger value="admins"><Shield className="h-4 w-4 mr-1" />Super admins</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="h-4 w-4 mr-1" />Audit</TabsTrigger>
          <TabsTrigger value="errors"><Bug className="h-4 w-4 mr-1" />Erreurs</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4"><DashboardPanel /></TabsContent>
        <TabsContent value="companies" className="mt-4"><CompaniesPanel /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="plans" className="mt-4"><PlansPanel /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesPanel /></TabsContent>
        
        <TabsContent value="reserved" className="mt-4"><ReservedNamesPanel /></TabsContent>
        <TabsContent value="admins" className="mt-4"><AdminsPanel /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPanel /></TabsContent>
        <TabsContent value="errors" className="mt-4"><ErrorsPanel /></TabsContent>
      </Tabs>

    </div>
  );
}

function CompaniesPanel() {
  const listFn = useServerFn(listCompaniesAdmin);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: () => listFn(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Entreprises ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Chargement...</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune entreprise.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Entreprise</th>
                  <th className="py-2">DG</th>
                  <th className="py-2">Membres</th>
                  <th className="py-2">Sièges</th>
                  <th className="py-2">Créée le</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-muted-foreground">
                      <div>{c.owner_name || "—"}</div>
                      <div className="text-xs">{c.owner_email}</div>
                    </td>
                    <td className="py-2">{c.members_count}</td>
                    <td className="py-2">
                      <span
                        className={
                          c.members_count >= c.seat_limit
                            ? "text-destructive font-medium"
                            : ""
                        }
                      >
                        {c.members_count} / {c.seat_limit}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {formatLongDate(c.created_at)}
                    </td>
                    <td className="py-2 text-right">
                      <SeatLimitDialog
                        companyId={c.id}
                        companyName={c.name}
                        current={c.seat_limit}
                      />
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

const SEAT_PRESETS = [10, 25, 50, 100, 250, 999];

function SeatLimitDialog({
  companyId,
  companyName,
  current,
}: {
  companyId: string;
  companyName: string;
  current: number;
}) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateSeatLimit);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);

  const mut = useMutation({
    mutationFn: (seatLimit: number) =>
      updateFn({ data: { companyId, seatLimit } }),
    onSuccess: () => {
      toast.success("Sièges mis à jour");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Modifier sièges
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sièges de {companyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SEAT_PRESETS.map((n) => (
              <Button
                key={n}
                type="button"
                variant={value === n ? "default" : "outline"}
                size="sm"
                onClick={() => setValue(n)}
              >
                {n === 999 ? "Illimité (999)" : n}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Personnalisé</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mut.mutate(value)}
            disabled={mut.isPending || value < 1 || value > 1000}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminsPanel() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlatformAdmins);
  const addFn = useServerFn(addPlatformAdmin);
  const removeFn = useServerFn(removePlatformAdmin);
  const [email, setEmail] = useState("");

  const { data: admins = [] } = useQuery({
    queryKey: ["platform-admins"],
    queryFn: () => listFn(),
  });

  const addMut = useMutation({
    mutationFn: () => addFn({ data: { email } }),
    onSuccess: () => {
      toast.success("Super admin ajouté");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Super admin retiré");
      queryClient.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Ajouter un super admin
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label>Email (doit avoir un compte existant)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <Button onClick={() => addMut.mutate()} disabled={!email || addMut.isPending}>
            Ajouter
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Super admins ({admins.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {admins.map((a) => (
              <div
                key={a.user_id}
                className="flex items-center justify-between border rounded p-3"
              >
                <div>
                  <div className="font-medium">{a.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{a.email}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Retirer ${a.email} des super admins ?`))
                      removeMut.mutate(a.user_id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReservedNamesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReservedNames);
  const addFn = useServerFn(addReservedName);
  const removeFn = useServerFn(removeReservedName);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["reserved-names"],
    queryFn: () => listFn(),
  });

  const addMut = useMutation({
    mutationFn: () => addFn({ data: { name, notes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Nom réservé ajouté");
      setName("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["reserved-names"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Retiré");
      qc.invalidateQueries({ queryKey: ["reserved-names"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Ajouter un nom réservé
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label>Nom de la marque</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Jumia" />
          </div>
          <div className="space-y-1">
            <Label>Note (optionnel)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={() => addMut.mutate()} disabled={!name.trim() || addMut.isPending}>
            Ajouter
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> Noms protégés ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun nom réservé.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded border p-2.5"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.display_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      slug : {r.slug}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Retirer « ${r.display_name} » ?`))
                        removeMut.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

