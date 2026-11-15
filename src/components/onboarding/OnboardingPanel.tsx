import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Sparkles, Users, X } from "lucide-react";
import { getOnboardingState } from "@/lib/onboarding.functions";

/**
 * Panneau d'activation : les premiers gestes qui font qu'un compte devient utile.
 * Il disparaît de lui-même une fois tout coché, et peut être masqué à la main.
 */
export function OnboardingPanel() {
  const fn = useServerFn(getOnboardingState);
  const { data } = useQuery({ queryKey: ["onboarding"], queryFn: () => fn() });
  const [hidden, setHidden] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("onboarding.hidden") === "1",
  );

  if (!data) return null;

  const { steps, completed, total, engagement } = data;
  const allDone = completed === total;
  const pct = Math.round((completed / total) * 100);

  function dismiss() {
    localStorage.setItem("onboarding.hidden", "1");
    setHidden(true);
  }

  return (
    <div className="space-y-4">
      {!allDone && !hidden && (
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Bien démarrer</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {completed} étape{completed > 1 ? "s" : ""} sur {total} — chaque étape rend
                l'application plus utile.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Masquer les étapes de démarrage"
              title="Masquer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          <ul className="mt-4 space-y-1">
            {steps.map((step) => (
              <li key={step.key}>
                <Link
                  to={step.to}
                  className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-muted/60"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      step.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-border text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[14px] ${
                        step.done ? "text-muted-foreground line-through" : "font-medium"
                      }`}
                    >
                      {step.label}
                    </span>
                    {!step.done && (
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                        {step.hint}
                      </span>
                    )}
                  </span>
                  {!step.done && (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {engagement && engagement.members > 1 && (
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold">Engagement de l'équipe</h2>
            <span className="text-[12px] text-muted-foreground">cette semaine</span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {engagement.activeThisWeek}
            </span>
            <span className="text-[13px] text-muted-foreground">
              sur {engagement.members} membre{engagement.members > 1 ? "s" : ""} ont publié un
              rapport
            </span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${
                engagement.activeThisWeek === 0
                  ? "bg-destructive/60"
                  : engagement.activeThisWeek / engagement.members >= 0.7
                    ? "bg-emerald-500"
                    : "bg-amber-500"
              }`}
              style={{
                width: `${Math.round((engagement.activeThisWeek / engagement.members) * 100)}%`,
              }}
            />
          </div>

          {engagement.silent.length > 0 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Sans rapport cette semaine : {engagement.silent.join(", ")}
              {engagement.silent.length >= 6 ? "…" : ""}
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-emerald-600 dark:text-emerald-400">
              Toute l'équipe a publié cette semaine.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
