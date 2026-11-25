import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import {
  activatePendingPlan,
  listPendingPlanRequests,
} from "@/lib/admin.functions";

/**
 * Demandes d'abonnement en attente.
 *
 * Permet d'activer la formule demandée sans créer de facture — cas d'un
 * paiement Mobile Money encaissé hors application.
 */
export function PendingPlansPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingPlanRequests);
  const activateFn = useServerFn(activatePendingPlan);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-pending-plans"],
    queryFn: () => listFn(),
  });

  const activate = useMutation({
    mutationFn: (companyId: string) => activateFn({ data: { companyId } }),
    onMutate: (companyId) => setBusy(companyId),
    onSuccess: async (result: any) => {
      toast.success(`Formule activée : ${result?.planName ?? ""}`);
      await qc.invalidateQueries({ queryKey: ["admin-pending-plans"] });
      await qc.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Activation impossible"),
    onSettled: () => setBusy(null),
  });

  if ((pending as any[]).length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-primary" />
          Demandes d'abonnement ({(pending as any[]).length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(pending as any[]).map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground">
                {row.planName} · {row.cycle === "yearly" ? "annuel" : "mensuel"}
                {row.price ? ` · ${row.price} FCFA` : ""}
              </p>
            </div>
            <Button
              size="sm"
              disabled={busy === row.id}
              onClick={() => activate.mutate(row.id)}
            >
              {busy === row.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Activer la formule
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
