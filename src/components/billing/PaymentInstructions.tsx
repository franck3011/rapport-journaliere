import { Clock, Smartphone } from "lucide-react";
import { PAYMENT_INFO } from "@/lib/payment-info";

/**
 * Mode de règlement manuel : Mobile Money puis activation par l'administrateur.
 * Utilisé tant qu'aucun prestataire de paiement automatique n'est branché.
 */
export function PaymentInstructions() {
  return (
    <section className="rounded-xl border bg-muted/30 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Paiement en attente</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Votre demande est enregistrée. Pour l'activer, réglez le montant par Mobile Money :
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-[13px] font-medium">
              <Smartphone className="h-3.5 w-3.5 text-primary" />
              {PAYMENT_INFO.phone}
            </span>
            {PAYMENT_INFO.providers.map((p) => (
              <span
                key={p}
                className="rounded-lg border bg-background px-2.5 py-1 text-[12px] text-muted-foreground"
              >
                {p}
              </span>
            ))}
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            {PAYMENT_INFO.note}
          </p>
        </div>
      </div>
    </section>
  );
}
