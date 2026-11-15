import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingStep = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  to: string;
};

export type TeamEngagement = {
  members: number;
  activeThisWeek: number;
  reportsThisWeek: number;
  silent: string[];
};

export type OnboardingState = {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  engagement: TeamEngagement | null;
};

/** Lundi de la semaine en cours (UTC), au format AAAA-MM-JJ. */
function weekStart(): string {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // lundi = 0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

const countOf = async (q: any): Promise<number> => {
  const { count } = await q;
  return count ?? 0;
};

export const getOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingState> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    const companyId: string | undefined = mem?.company_id;
    const isOwner = mem?.role === "owner";

    const [myReports, members, objectives, actions, mailAccounts] = await Promise.all([
      countOf(
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("author_id", userId),
      ),
      countOf(
        companyId
          ? supabase
              .from("company_members")
              .select("user_id", { count: "exact", head: true })
              .eq("company_id", companyId)
          : Promise.resolve({ count: 0 }),
      ),
      countOf(
        companyId
          ? supabase
              .from("objectives")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
          : Promise.resolve({ count: 0 }),
      ),
      countOf(
        companyId
          ? supabase
              .from("report_actions")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
          : Promise.resolve({ count: 0 }),
      ),
      countOf(
        supabase
          .from("email_accounts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ),
    ]);

    const steps: OnboardingStep[] = [
      {
        key: "report",
        label: "Publier votre premier rapport",
        hint: "C'est le geste central : vos équipes racontent leur journée, vous la lisez.",
        done: myReports > 0,
        to: "/reports/new",
      },
      {
        key: "team",
        label: "Inviter un collaborateur",
        hint: "Un rapport seul ne sert à rien : l'intérêt commence à deux.",
        done: members > 1,
        to: "/company",
      },
      {
        key: "action",
        label: "Créer une première action",
        hint: "Transformer une décision en action datée et suivie.",
        done: actions > 0,
        to: "/actions",
      },
      {
        key: "objective",
        label: "Fixer un objectif",
        hint: "Donnez une cible à l'équipe : rapports, CA, incidents.",
        done: objectives > 0,
        to: "/objectives",
      },
      {
        key: "mail",
        label: "Connecter une boîte mail",
        hint: "Optionnel : réunir vos e-mails dans la même application.",
        done: mailAccounts > 0,
        to: "/mail/settings",
      },
    ];

    let engagement: TeamEngagement | null = null;
    if (companyId && isOwner) {
      const from = weekStart();
      const { data: weekReports } = await supabase
        .from("reports")
        .select("author_id")
        .gte("report_date", from);

      const active = new Set<string>(((weekReports ?? []) as any[]).map((r) => r.author_id));

      const { data: memberRows } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId);

      const memberIds = ((memberRows ?? []) as any[]).map((m) => m.user_id);
      const silentIds = memberIds.filter((id: string) => !active.has(id));

      let silent: string[] = [];
      if (silentIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles_public")
          .select("id, full_name")
          .in("id", silentIds.slice(0, 50));
        silent = ((profs ?? []) as any[])
          .map((p) => p.full_name || "Utilisateur")
          .slice(0, 6);
      }

      engagement = {
        members: memberIds.length,
        activeThisWeek: memberIds.filter((id: string) => active.has(id)).length,
        reportsThisWeek: (weekReports ?? []).length,
        silent,
      };
    }

    return {
      steps,
      completed: steps.filter((s) => s.done).length,
      total: steps.length,
      engagement,
    };
  });
