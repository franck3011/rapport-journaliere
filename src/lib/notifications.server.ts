export type NotificationType =
  | "report_submitted"
  | "report_approved"
  | "report_rejected"
  | "report_reminder"
  | "task_assigned"
  | "task_completed"
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "expense_submitted"
  | "expense_approved"
  | "expense_rejected"
  | "document_shared"
  | "action_assigned"
  | "action_reminder"
  | "action_overdue";

export type NotificationDraft = {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  report_id?: string | null;
  actor_id?: string | null;
};

/**
 * Crée des notifications in-app. Ne jette jamais : une notification manquée
 * ne doit pas faire échouer l'action métier qui l'a déclenchée.
 */
export async function notify(drafts: NotificationDraft[]): Promise<void> {
  const rows = drafts.filter((d) => !!d.user_id);
  if (rows.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").insert(
      rows.map((d) => ({
        user_id: d.user_id,
        type: d.type,
        title: d.title,
        body: d.body ?? null,
        report_id: d.report_id ?? null,
        actor_id: d.actor_id ?? null,
      })),
    );
  } catch (err) {
    console.error("[notify] échec de création de notification", err);
  }
}
