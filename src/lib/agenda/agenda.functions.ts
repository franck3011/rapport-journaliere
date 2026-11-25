import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Agenda : agrège les échéances réelles de l'application et les événements
 * créés à la main.
 *
 * Aucune duplication : les actions, jalons, e-mails programmés et absences sont
 * lus à leur source. Seuls les événements manuels vivent dans
 * company_agenda_events.
 */

export type AgendaItem = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  title: string;
  kind: string;
  source: "manuel" | "action" | "jalon" | "mail" | "absence";
  recurring?: boolean;
  editable: boolean;
};

async function companyOf(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Vous devez appartenir à une entreprise.");
  return data.company_id as string;
}

/** Étale une récurrence simple dans la fenêtre demandée. */
function expand(
  base: string,
  recurrence: string,
  from: string,
  to: string,
): string[] {
  if (recurrence === "none") return base >= from && base <= to ? [base] : [];
  const out: string[] = [];
  const start = new Date(`${base}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const cursor = new Date(start);
  const fromDate = new Date(`${from}T00:00:00Z`);
  let guard = 0;

  while (cursor <= end && guard < 400) {
    guard++;
    if (cursor >= fromDate) out.push(cursor.toISOString().slice(0, 10));
    if (recurrence === "daily") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (recurrence === "weekly") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export const listAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }: any): Promise<AgendaItem[]> => {
    const supabase: any = context.supabase;
    const companyId = await companyOf(supabase, context.userId);
    const items: AgendaItem[] = [];

    // 1. Événements manuels (avec récurrence)
    const { data: events } = await supabase
      .from("company_agenda_events")
      .select("id, title, kind, event_date, event_time, recurrence, notes")
      .eq("company_id", companyId)
      .limit(500);

    for (const row of (events ?? []) as any[]) {
      // Une récurrence n'est affichée qu'une fois : à sa prochaine occurrence.
      // Déplier chaque jour produisait des dizaines de lignes identiques.
      const dates = expand(row.event_date, row.recurrence, data.from, data.to).slice(0, 1);
      for (const date of dates) {
        items.push({
          id: `${row.id}-${date}`,
          date,
          time: row.event_time ? String(row.event_time).slice(0, 5) : null,
          title: row.title,
          kind: row.kind,
          source: "manuel",
          recurring: row.recurrence !== "none",
          editable: true,
        });
      }
    }

    // 2. Actions à échéance
    const { data: actions } = await supabase
      .from("report_actions")
      .select("id, title, due_date, status")
      .eq("company_id", companyId)
      .in("status", ["todo", "doing"])
      .gte("due_date", data.from)
      .lte("due_date", data.to)
      .limit(300);
    for (const row of (actions ?? []) as any[]) {
      items.push({
        id: `action-${row.id}`,
        date: row.due_date,
        time: null,
        title: row.title,
        kind: "action",
        source: "action",
        editable: false,
      });
    }

    // 3. Jalons de projet
    try {
      const { data: milestones } = await supabase
        .from("project_milestones")
        .select("id, title, due_date, project_id")
        .gte("due_date", data.from)
        .lte("due_date", data.to)
        .limit(300);
      for (const row of (milestones ?? []) as any[]) {
        items.push({
          id: `jalon-${row.id}`,
          date: row.due_date,
          time: null,
          title: row.title,
          kind: "jalon",
          source: "jalon",
          editable: false,
        });
      }
    } catch {
      // table absente ou RLS restrictive : l'agenda reste utilisable
    }

    // 4. E-mails programmés
    try {
      const fromIso = `${data.from}T00:00:00Z`;
      const toIso = `${data.to}T23:59:59Z`;
      const { data: mails } = await supabase
        .from("email_scheduled_messages")
        .select("id, subject, scheduled_at, status")
        .gte("scheduled_at", fromIso)
        .lte("scheduled_at", toIso)
        .limit(200);
      for (const row of (mails ?? []) as any[]) {
        const when = new Date(row.scheduled_at);
        items.push({
          id: `mail-${row.id}`,
          date: when.toISOString().slice(0, 10),
          time: when.toISOString().slice(11, 16),
          title: row.subject ?? "E-mail programmé",
          kind: "mail",
          source: "mail",
          editable: false,
        });
      }
    } catch {
      // messagerie non configurée
    }

    // 5. Absences
    try {
      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("id, start_date, end_date, status")
        .in("status", ["approved", "pending"])
        .lte("start_date", data.to)
        .gte("end_date", data.from)
        .limit(200);
      for (const row of (leaves ?? []) as any[]) {
        items.push({
          id: `absence-${row.id}`,
          date: row.start_date,
          time: null,
          title: `Absence (${row.status === "approved" ? "validée" : "en attente"})`,
          kind: "absence",
          source: "absence",
          editable: false,
        });
      }
    } catch {
      // module congés absent
    }

    return items.sort((a, b) =>
      a.date === b.date
        ? String(a.time ?? "99").localeCompare(String(b.time ?? "99"))
        : a.date.localeCompare(b.date),
    );
  });

export const createAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(160),
        kind: z.enum(["rapport", "mail", "reunion", "relance", "autre"]),
        eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        eventTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }: any): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const companyId = await companyOf(supabase, context.userId);

    const { data: row, error } = await supabase
      .from("company_agenda_events")
      .insert({
        company_id: companyId,
        title: data.title,
        kind: data.kind,
        event_date: data.eventDate,
        event_time: data.eventTime ?? null,
        recurrence: data.recurrence,
        notes: data.notes ?? "",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }: any): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("company_agenda_events")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
