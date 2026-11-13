/**
 * Relances des actions — exécuté par un cron quotidien.
 *
 * Deux niveaux :
 *  1. la veille de l'échéance → rappel au responsable ;
 *  2. deux jours de retard → alerte au responsable ET à son manager.
 *
 * Idempotent : `last_reminded_at` empêche de notifier deux fois la même action
 * le même jour, même si le cron est relancé.
 */

function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

export type ReminderResult = {
  reminders: number;
  escalations: number;
  skipped: number;
};

export async function sendActionReminders(): Promise<ReminderResult> {
  const { supabaseAdmin: adminRaw } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin: any = adminRaw;
  const { notify } = await import("@/lib/notifications.server");

  const today = isoDay(0);
  const tomorrow = isoDay(1);
  const overdueLimit = isoDay(-2); // 2 jours de retard
  const startOfToday = `${today}T00:00:00.000Z`;

  const { data: rows, error } = await supabaseAdmin
    .from("report_actions")
    .select("id, title, owner_id, company_id, due_date, last_reminded_at")
    .in("status", ["todo", "doing"])
    .or(`due_date.eq.${tomorrow},due_date.lte.${overdueLimit}`);

  if (error) throw new Error(error.message);
  const candidates = (rows ?? []) as any[];

  const dueTomorrow = candidates.filter((r) => r.due_date === tomorrow);
  const overdue = candidates.filter((r) => r.due_date && r.due_date <= overdueLimit);
  const fresh = [...dueTomorrow, ...overdue].filter(
    (r) => !r.last_reminded_at || r.last_reminded_at < startOfToday,
  );

  const skipped = dueTomorrow.length + overdue.length - fresh.length;
  if (fresh.length === 0) return { reminders: 0, escalations: 0, skipped };

  // Managers des responsables concernés (une seule requête)
  const ownerIds = Array.from(new Set(fresh.map((r) => r.owner_id)));
  const { data: members } = await supabaseAdmin
    .from("company_members")
    .select("user_id, manager_id")
    .in("user_id", ownerIds);
  const managerOf = new Map<string, string | null>(
    ((members ?? []) as any[]).map((m) => [m.user_id, m.manager_id ?? null]),
  );

  let reminders = 0;
  let escalations = 0;

  for (const action of fresh) {
    const isOverdue = action.due_date <= overdueLimit;

    await notify([
      {
        user_id: action.owner_id,
        type: isOverdue ? "action_overdue" : "action_reminder",
        title: isOverdue ? "Action en retard" : "Échéance demain",
        body: action.title,
        actor_id: null,
      },
    ]);
    reminders++;

    if (isOverdue) {
      const managerId = managerOf.get(action.owner_id);
      if (managerId && managerId !== action.owner_id) {
        await notify([
          {
            user_id: managerId,
            type: "action_overdue",
            title: "Une action de votre équipe est en retard",
            body: action.title,
            actor_id: null,
          },
        ]);
        escalations++;
      }
    }

    await supabaseAdmin
      .from("report_actions")
      .update({ last_reminded_at: new Date().toISOString() })
      .eq("id", action.id);
  }

  return { reminders, escalations, skipped };
}
