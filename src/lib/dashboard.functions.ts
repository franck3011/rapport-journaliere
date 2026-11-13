import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardSummary = {
  companyName: string | null;
  reportsThisMonth: number;
  reportsPrevMonth: number;
  reportsToApprove: number;
  tasksOpen: number;
  tasksOverdue: number;
  leavesPending: number;
  leavesToApprove: number;
  expensesPending: number;
  expensesApprovedAmount: number;
  documentsCount: number;
  unreadNotifications: number;
  actionsOpen: number;
  actionsLate: number;
};

const count = async (q: any): Promise<number> => {
  const { count: c } = await q;
  return c ?? 0;
};

export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardSummary> => {
    const sb = context.supabase;
    const uid = context.userId;
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const todayIso = today.toISOString().slice(0, 10);
    // Mois précédent, calculé en UTC pour éviter tout décalage de fuseau.
    const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 10);
    const prevMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
      .toISOString()
      .slice(0, 10);

    const { data: mem } = await sb
      .from("company_members")
      .select("company_id")
      .eq("user_id", uid)
      .maybeSingle();
    const companyId = (mem as any)?.company_id as string | undefined;

    let companyName: string | null = null;
    if (companyId) {
      const { data: company } = await sb
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle();
      companyName = ((company as any)?.name as string) ?? null;
    }

    const [
      reportsThisMonth,
      reportsToApprove,
      tasksOpen,
      tasksOverdue,
      leavesPending,
      leavesToApprove,
      expensesPending,
      documentsCount,
      unreadNotifications,
      reportsPrevMonth,
      actionsOpen,
      actionsLate,
    ] = await Promise.all([
      count(
        sb
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("author_id", uid)
          .gte("report_date", monthStart),
      ),
      count(
        sb
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("current_approver_id", uid)
          .eq("status", "submitted"),
      ),
      count(
        sb
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_id", uid)
          .in("status", ["todo", "in_progress"]),
      ),
      count(
        sb
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_id", uid)
          .in("status", ["todo", "in_progress"])
          .lt("due_date", todayIso),
      ),
      count(
        sb
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", uid)
          .in("status", ["submitted", "pending"]),
      ),
      count(
        sb
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("current_approver_id", uid)
          .in("status", ["submitted", "pending"]),
      ),
      count(
        sb
          .from("expense_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "En attente"]),
      ),
      count(sb.from("documents").select("id", { count: "exact", head: true })),
      count(
        sb
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .is("read_at", null),
      ),
      count(
        sb
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("author_id", uid)
          .gte("report_date", prevMonthStart)
          .lte("report_date", prevMonthEnd),
      ),
      count(
        (sb as any)
          .from("report_actions")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", uid)
          .in("status", ["todo", "doing"]),
      ),
      count(
        (sb as any)
          .from("report_actions")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", uid)
          .in("status", ["todo", "doing"])
          .lt("due_date", todayIso),
      ),
    ]);

    const { data: approved } = await sb
      .from("expense_reports")
      .select("amount")
      .eq("author_id", uid)
      .eq("status", "approved")
      .gte("expense_date", monthStart);
    const expensesApprovedAmount = (approved ?? []).reduce(
      (sum: number, r: any) => sum + Number(r.amount ?? 0),
      0,
    );

    return {
      companyName,
      reportsThisMonth,
      reportsPrevMonth,
      reportsToApprove,
      tasksOpen,
      tasksOverdue,
      leavesPending,
      leavesToApprove,
      expensesPending,
      expensesApprovedAmount,
      documentsCount,
      unreadNotifications,
      actionsOpen,
      actionsLate,
    };
  });
