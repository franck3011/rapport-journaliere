import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight } from "lucide-react";
import { appAssetUrl } from "@/lib/app-url";
import { PublicNav, PublicFooter } from "./index";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Tarifs — DailyBrief" },
      {
        name: "description",
        content:
          "Choisissez la formule DailyBrief adaptée à votre équipe : Free, Starter, Business, Enterprise. Facturation mensuelle ou annuelle.",
      },
      { property: "og:title", content: "Tarifs — DailyBrief" },
      {
        property: "og:description",
        content: "Formules DailyBrief pour PME et grandes équipes. Facturation flexible.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: appAssetUrl("/og-dailybrief.jpg") },
      { name: "twitter:image", content: appAssetUrl("/og-dailybrief.jpg") },
    ],
  }),
  component: PricingPage,
});

type Plan = {
  name: string;
  tagline: string;
  monthly: string;
  yearly: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    tagline: "Pour tester la plateforme",
    monthly: "0 FCFA",
    yearly: "0 FCFA",
    features: [
      "1 entreprise",
      "Jusqu'à 3 employés",
      "Rapports & PV illimités",
      "Assistant IA (usage limité)",
    ],
    cta: "Commencer gratuitement",
  },
  {
    name: "Starter",
    tagline: "Pour petites équipes",
    monthly: "9 900 FCFA / mois",
    yearly: "99 000 FCFA / an",
    features: [
      "Jusqu'à 15 employés",
      "Partage sécurisé avec expiration",
      "Export PDF avancé",
      "Support par email",
    ],
    cta: "Choisir Starter",
    highlight: true,
  },
  {
    name: "Business",
    tagline: "Pour PME en croissance",
    monthly: "29 900 FCFA / mois",
    yearly: "299 000 FCFA / an",
    features: [
      "Jusqu'à 100 employés",
      "KYC entreprise renforcé",
      "Statistiques dirigeants",
      "Support prioritaire",
    ],
    cta: "Choisir Business",
  },
  {
    name: "Enterprise",
    tagline: "Grandes organisations",
    monthly: "Sur devis",
    yearly: "Sur devis",
    features: [
      "Sièges illimités",
      "SSO, audit avancé",
      "Personnalisation & SLA",
      "Accompagnement dédié",
    ],
    cta: "Nous contacter",
  },
];

function PricingPage() {
  const [authed, setAuthed] = useState(false);
  const [yearly, setYearly] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PublicNav authed={authed} />
      <main className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Une formule pour chaque équipe
          </h1>
          <p className="mt-4 text-muted-foreground">
            Démarrez gratuitement, passez à un plan payant quand vous êtes prêt.
          </p>
          <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1 text-sm">
            <button
              onClick={() => setYearly(false)}
              className={`rounded-md px-3 py-1.5 ${!yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`rounded-md px-3 py-1.5 ${yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Annuel <span className="ml-1 text-xs opacity-80">-15%</span>
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-xl border bg-card p-6 ${
                p.highlight ? "border-primary shadow-lg shadow-primary/10" : "border-border"
              }`}
            >
              {p.highlight && (
                <div className="mb-2 inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Le plus populaire
                </div>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <div className="mt-4 text-2xl font-semibold">
                {yearly ? p.yearly : p.monthly}
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={p.highlight ? "default" : "outline"}
                className="mt-6"
              >
                <Link to={authed ? "/plans" : "/auth"}>
                  {p.cta} <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Les tarifs sont indicatifs. Le paiement en ligne sera activé prochainement — contactez-nous
          pour toute demande sur mesure.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
