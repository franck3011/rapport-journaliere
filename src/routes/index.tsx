import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { appAssetUrl } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Users,
  ShieldCheck,
  Sparkles,
  Building2,
  ChevronRight,
  CheckCircle2,
  BarChart3,
  Share2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DailyBrief — Rapports quotidiens & PV pour équipes" },
      {
        name: "description",
        content:
          "DailyBrief : plateforme SaaS pour créer, partager et suivre les rapports quotidiens et procès-verbaux de votre entreprise, avec assistant IA intégré.",
      },
      { property: "og:title", content: "DailyBrief — Rapports quotidiens pour équipes" },
      {
        property: "og:description",
        content:
          "Créez, partagez et suivez les rapports quotidiens et PV de votre équipe. Assistant IA, KYC, partage sécurisé.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: appAssetUrl("/og-dailybrief.jpg") },
      { name: "twitter:image", content: appAssetUrl("/og-dailybrief.jpg") },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PublicNav authed={authed} />
      <main>
        <Hero authed={authed} />
        <Features />
        <ForWho />
        <CTA authed={authed} />
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicNav({ authed }: { authed: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-4 w-4" />
          </span>
          DailyBrief
        </Link>
        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/pricing" className="hover:text-foreground">Tarifs</Link>
          <a href="/#features" className="hover:text-foreground">Fonctionnalités</a>
          <Link to="/legal/privacy" className="hover:text-foreground">Confidentialité</Link>
        </nav>
        <div className="flex items-center gap-2">
          {authed ? (
            <Button asChild size="sm">
              <Link to="/reports">Mes rapports</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Se connecter</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth">Commencer</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Assistant IA intégré · Made in Côte d'Ivoire
          </div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Les rapports quotidiens de votre équipe, <span className="text-primary">enfin simples</span>.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground md:text-xl">
            DailyBrief centralise les rapports journaliers, les procès-verbaux et les livrables
            de vos collaborateurs. Assistant IA, partage sécurisé, export PDF.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {authed ? (
              <Button asChild size="lg">
                <Link to="/reports">
                  Ouvrir mon espace <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/auth">
                    Créer un compte gratuit <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/pricing">Voir les tarifs</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Sans carte de crédit · Essai gratuit · Connexion Google
          </p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: FileText,
      title: "Rapports quotidiens",
      desc: "Formulaire structuré avec sections, listes, images légendées et pièces jointes.",
    },
    {
      icon: Sparkles,
      title: "Assistant IA",
      desc: "Résumés automatiques, corrections orthographiques, reformulations en un clic.",
    },
    {
      icon: Users,
      title: "Espace entreprise",
      desc: "Invitez vos employés, suivez leur activité, détectez les rapports manquants.",
    },
    {
      icon: Share2,
      title: "Partage sécurisé",
      desc: "Liens partageables avec expiration paramétrable et journal d'audit complet.",
    },
    {
      icon: ShieldCheck,
      title: "KYC & anti-usurpation",
      desc: "Vérification d'identité pour les noms d'entreprises protégés en Côte d'Ivoire.",
    },
    {
      icon: BarChart3,
      title: "Tableau de bord DG",
      desc: "Vue synthétique de l'activité de vos équipes et des rapports en attente.",
    },
  ];
  return (
    <section id="features" className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Tout ce qu'il faut pour piloter vos équipes
          </h2>
          <p className="mt-3 text-muted-foreground">
            Une plateforme complète, pensée pour les dirigeants et les managers exigeants.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForWho() {
  const rows = [
    {
      icon: Building2,
      title: "PME et grandes équipes",
      points: [
        "Reporting quotidien standardisé",
        "Compte-rendus de réunion (PV)",
        "Historique consultable et exportable",
      ],
    },
    {
      icon: Users,
      title: "Managers & DG",
      points: [
        "Vue d'ensemble des employés actifs",
        "Alertes sur inactivité",
        "Statistiques par période",
      ],
    },
  ];
  return (
    <section className="border-b border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid gap-6 md:grid-cols-2">
          {rows.map(({ icon: Icon, title, points }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-medium">{title}</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA({ authed }: { authed: boolean }) {
  return (
    <section>
      <div className="mx-auto max-w-4xl px-4 py-16 text-center md:py-24">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Prêt à structurer les rapports de votre équipe ?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Créez votre compte, invitez vos collaborateurs et démarrez en quelques minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to={authed ? "/reports" : "/auth"}>
              {authed ? "Ouvrir mon espace" : "Créer un compte"}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/pricing">Voir les tarifs</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <span>© {new Date().getFullYear()} DailyBrief</span>
        </div>
        <nav className="flex flex-wrap items-center gap-4">
          <Link to="/pricing" className="hover:text-foreground">Tarifs</Link>
          <Link to="/legal/privacy" className="hover:text-foreground">Confidentialité</Link>
          <Link to="/legal/terms" className="hover:text-foreground">CGU</Link>
          <Link to="/auth" className="hover:text-foreground">Se connecter</Link>
        </nav>
      </div>
    </footer>
  );
}
