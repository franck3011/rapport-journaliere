import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ActionStatus = "todo" | "doing" | "done" | "cancelled";
export type ActionPriority = "normal" | "high" | "urgent";

export type ActionRow = {
  id: string;
  report_id: string | null;
  report_title: string | null;
  title: string;
  details: string;
  owner_id: string;
  owner_name: string;
  status: ActionStatus;
  priority: ActionPriority;
  due_date: string | null;
  completed_at: string | null;
  created_by: string;
  source: "manual" | "ai";
  created_at: string;
  is_mine: boolean;
  is_late: boolean;
};

export type ActionMember = { id: string; name: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

async function myCompanyId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.company_id ?? null;
}

/** Identifiants des subordonnés directs et indirects (chaîne de management). */
function descendants(
  members: { user_id: string; manager_id: string | null }[],
  rootId: string,
): Set<string> {
  const byManager = new Map<string, string[]>();
  for (const m of members) {
    if (!m.manager_id) continue;
    const list = byManager.get(m.manager_id) ?? [];
    list.push(m.user_id);
    byManager.set(m.manager_id, list);
  }
  const out = new Set<string>();
  const stack = [...(byManager.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of byManager.get(id) ?? []) stack.push(child);
  }
  return out;
}

function isLate(row: { status: string; due_date: string | null }): boolean {
  if (!row.due_date) return false;
  if (row.status === "done" || row.status === "cancelled") return false;
  return row.due_date < new Date().toISOString().slice(0, 10);
}

async function decorate(
  supabase: any,
  rows: any[],
  userId: string,
): Promise<ActionRow[]> {
  if (rows.length === 0) return [];
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
  const reportIds = Array.from(
    new Set(rows.map((r) => r.report_id).filter((x): x is string => !!x)),
  );

  const [{ data: profs }, { data: reps }] = await Promise.all([
    supabase.from("profiles_public").select("id, full_name").in("id", ownerIds),
    reportIds.length
      ? supabase.from("reports").select("id, title").in("id", reportIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const nameOf = new Map<string, string>(
    ((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Utilisateur"]),
  );
  const titleOf = new Map<string, string>(
    ((reps ?? []) as any[]).map((r) => [r.id, r.title]),
  );

  return rows.map((r) => ({
    id: r.id,
    report_id: r.report_id,
    report_title: r.report_id ? titleOf.get(r.report_id) ?? null : null,
    title: r.title,
    details: r.details ?? "",
    owner_id: r.owner_id,
    owner_name: nameOf.get(r.owner_id) ?? "Utilisateur",
    status: r.status as ActionStatus,
    priority: r.priority as ActionPriority,
    due_date: r.due_date,
    completed_at: r.completed_at,
    created_by: r.created_by,
    source: r.source,
    created_at: r.created_at,
    is_mine: r.owner_id === userId,
    is_late: isLate(r),
  }));
}

/** Liste des actions, filtrée par périmètre (la RLS borne déjà la visibilité). */
export const listActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["mine", "team", "company"]).default("mine"),
        includeDone: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ActionRow[]> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) return [];

    const [{ data: rows }, { data: members }] = await Promise.all([
      supabase
        .from("report_actions")
        .select("*")
        .eq("company_id", companyId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("company_members").select("user_id, manager_id").eq("company_id", companyId),
    ]);

    const team = descendants((members ?? []) as any[], userId);
    const filtered = ((rows ?? []) as any[]).filter((r) => {
      if (!data.includeDone && (r.status === "done" || r.status === "cancelled")) return false;
      if (data.scope === "mine") return r.owner_id === userId;
      if (data.scope === "team") return team.has(r.owner_id);
      return true;
    });

    return decorate(supabase, filtered, userId);
  });

/** Actions rattachées à un rapport précis. */
export const listReportActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ reportId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ActionRow[]> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const { data: rows } = await supabase
      .from("report_actions")
      .select("*")
      .eq("report_id", data.reportId)
      .order("created_at", { ascending: true });
    return decorate(supabase, (rows ?? []) as any[], userId);
  });

/** Membres assignables (soi-même + périmètre autorisé). */
export const listActionMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActionMember[]> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) return [];

    const [{ data: members }, { data: profs }] = await Promise.all([
      supabase.from("company_members").select("user_id, manager_id").eq("company_id", companyId),
      supabase.from("profiles_public").select("id, full_name"),
    ]);

    const team = descendants((members ?? []) as any[], userId);
    const allowed = new Set<string>([userId, ...team]);
    const nameOf = new Map<string, string>(
      ((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Utilisateur"]),
    );

    return Array.from(allowed).map((id) => ({
      id,
      name: nameOf.get(id) ?? "Utilisateur",
    }));
  });

export const createAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reportId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(3, "Le titre est trop court").max(200),
        details: z.string().max(2000).default(""),
        ownerId: z.string().uuid(),
        dueDate: dateSchema.nullable().optional(),
        priority: z.enum(["normal", "high", "urgent"]).default("normal"),
        source: z.enum(["manual", "ai"]).default("manual"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) throw new Error("Vous devez appartenir à une entreprise.");

    const { data: owner } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("user_id", data.ownerId)
      .maybeSingle();
    if (!owner) throw new Error("Le responsable doit faire partie de votre entreprise.");

    const { data: inserted, error } = await supabase
      .from("report_actions")
      .insert({
        company_id: companyId,
        report_id: data.reportId ?? null,
        title: data.title,
        details: data.details ?? "",
        owner_id: data.ownerId,
        created_by: userId,
        priority: data.priority,
        due_date: data.dueDate ?? null,
        source: data.source,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (data.ownerId !== userId) {
      const { notify } = await import("@/lib/notifications.server");
      await notify([
        {
          user_id: data.ownerId,
          type: "task_assigned",
          title: "Une action vous a été assignée",
          body: data.title,
          actor_id: userId,
        },
      ]);
    }

    return { ok: true, id: (inserted as any)?.id as string | undefined };
  });

export const updateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["todo", "doing", "done", "cancelled"]).optional(),
        title: z.string().trim().min(3).max(200).optional(),
        details: z.string().max(2000).optional(),
        ownerId: z.string().uuid().optional(),
        dueDate: dateSchema.nullable().optional(),
        priority: z.enum(["normal", "high", "urgent"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.title !== undefined) patch.title = data.title;
    if (data.details !== undefined) patch.details = data.details;
    if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await (context.supabase as any)
      .from("report_actions")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("report_actions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ActionsSummary = {
  mineOpen: number;
  mineLate: number;
  mineThisWeek: number;
};

export const getActionsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActionsSummary> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;
    const companyId = await myCompanyId(supabase, userId);
    if (!companyId) return { mineOpen: 0, mineLate: 0, mineThisWeek: 0 };

    const { data: rows } = await supabase
      .from("report_actions")
      .select("status, due_date")
      .eq("company_id", companyId)
      .eq("owner_id", userId)
      .in("status", ["todo", "doing"]);

    const today = new Date().toISOString().slice(0, 10);
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    let mineLate = 0;
    let mineThisWeek = 0;
    for (const r of (rows ?? []) as any[]) {
      if (r.due_date && r.due_date < today) mineLate++;
      else if (r.due_date && r.due_date <= inSevenDays) mineThisWeek++;
    }
    return { mineOpen: (rows ?? []).length, mineLate, mineThisWeek };
  });
