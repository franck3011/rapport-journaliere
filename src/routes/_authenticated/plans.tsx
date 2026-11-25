import { activateMyPendingPlan, amIPlatformAdmin } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/currency";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPlans } from "@/lib/admin.functions";
import { PaymentInstructions } from "@/components/billing/PaymentInstructions";
import {
  getMyCompanyPlan,
  requestPlanChange,
} from "@/lib/company.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Check, Sparkles, Clock, Wrench, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plans")({
  component: PlansPage,
});

function eur(cents: number) {
  return formatPrice(cents);
}

function PlansPage() {
  const qc = useQueryClient();
  const plansFn = useServerFn(listPlans);
  const myFn = useServerFn(getMyCompanyPlan);
  const requestFn = useServerFn(requestPlanChange);

  // Un administrateur plateforme peut activer sa propre demande (cas du fondateur).
  const adminFn = useServerFn(amIPlatformAdmin);
  const activateFn = useServerFn(activateMyPendingPlan);
  const qcPlans = useQueryClient();
  const { data: isAdmin = false } = useQuery({
    queryKey: ["am-i-platform-admin"],
    queryFn: () => adminFn(),
  });
  const activate = useMutation({
    mutationFn: () => activateFn({ data: {} } as any),
    onSuccess: async (result: any) => {
      toast.success(`Formule activée : ${result?.planName ?? ""}`);
      await qcPlans.invalidateQueries();
    },
    onError: (error: any) => toast.error(error?.message ?? "Activation impossible"),
  });
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => plansFn(),
  });
  const { data: mine } = useQuery({
    queryKey: ["my-company-plan"],
    queryFn: () => myFn(),
  });

  const mut = useMutation({
    mutationFn: (planId: string) =>
      requestFn({ data: { planId, billingCycle: cycle } }),
    onSuccess: () => {
      toast.success("Demande envoyée. Un administrateur validera votre changement de plan.");
      qc.invalidateQueries({ queryKey: ["my-company-plan"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const isOwner = mine?.isOwner ?? false;
  const currentId = mine?.currentPlanId ?? null;
  const pendingId = mine?.pendingPlanId ?? null;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
      <header className="grid grid-cols-1 gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex min-w-0 items-center gap-2">
            <Package className="h-6 w-6 shrink-0 text-primary" />{" "}
            <span className="truncate">Plans &amp; tarifs</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {mine?.companyName
              ? `Choisissez le plan adapté à ${mine.companyName}.`
              : "Choisissez le plan adapté à votre entreprise."}
          </p>
        </div>
        <Tabs value={cycle} onValueChange={(v) => setCycle(v as "monthly" | "yearly")}>
          <TabsList>
            <TabsTrigger value="monthly">Mensuel</TabsTrigger>
            <TabsTrigger value="yearly">Annuel</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Wrench className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Paiement en ligne : en cours de développement</p>
            <p className="text-muted-foreground">
              L'encaissement automatique par carte n'est pas encore actif. Votre demande de
              plan est enregistrée puis validée manuellement par l'administration, sans
              paiement immédiat.
            </p>
          </div>
        </CardContent>
      </Card>

      {mine?.pendingPlanId && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="text-sm">
              Demande de passage au plan{" "}
              <span className="font-semibold">{mine.pendingPlanName}</span> (
              {mine.pendingBillingCycle === "yearly" ? "annuel" : "mensuel"}) en attente
              d'approbation par l'administration.
            </div>
            {isAdmin && (
              <Button
                size="sm"
                className="ml-auto shrink-0"
                disabled={activate.isPending}
                onClick={() => activate.mutate()}
              >
                {activate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Activer la formule
              </Button>
            )}
            <div className="hidden">
            </div>
          </CardContent>
        </Card>
      )}

      {!isOwner && mine?.companyId && (
        <p className="text-sm text-muted-foreground">
          Seul le dirigeant de l'entreprise peut modifier le plan.
        </p>
      )}
      {!mine?.companyId && (
        <p className="text-sm text-muted-foreground">
          Créez ou rejoignez une entreprise pour pouvoir choisir un plan.
        </p>
      )}

      {pendingId && <PaymentInstructions />}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun plan disponible pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = currentId === p.id;
            const isPending = pendingId === p.id;
            const price = cycle === "yearly" ? p.yearly_price_cents : p.monthly_price_cents;
            return (
              <Card
                key={p.id}
                className={isCurrent ? "border-primary shadow-md" : ""}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {p.name}
                    </CardTitle>
                    {isCurrent && (
                      <Badge className="gap-1">
                        <Sparkles className="h-3 w-3" /> Plan actuel
                      </Badge>
                    )}
                    {!isCurrent && isPending && <Badge variant="secondary">Demandé</Badge>}
                  </div>
                  {p.description && (
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{eur(price)}</span>
                    <span className="text-sm text-muted-foreground">
                      / {cycle === "yearly" ? "an" : "mois"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.seat_limit} sièges inclus
                    {p.price_per_extra_seat_cents > 0 &&
                      ` · ${eur(p.price_per_extra_seat_cents)} par siège supplémentaire`}
                  </div>
                  {p.features.length > 0 && (
                    <ul className="space-y-1.5 text-sm">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    className="w-full"
                    disabled={
                      !isOwner ||
                      !mine?.companyId ||
                      isCurrent ||
                      mut.isPending
                    }
                    variant={isCurrent ? "outline" : "default"}
                    onClick={() => mut.mutate(p.id)}
                  >
                    {isCurrent
                      ? "Plan actif"
                      : isPending
                        ? "Demande en attente"
                        : "Choisir ce plan"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
