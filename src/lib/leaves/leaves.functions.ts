import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/leaves/types";

export const listLeaveTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveType[]> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "leaves");
    const { data, error } = await context.supabase
      .from("leave_types")
      .select("id, code, name, is_paid, requires_proof, default_days")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t: any) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      is_paid: t.is_paid,
      requires_proof: t.requires_proof,
      default_days: Number(t.default_days ?? 0),
    }));
  });

export const leavesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      balances: LeaveBalance[];
      mine: LeaveRequest[];
      team: LeaveRequest[];
      pendingCount: number;
    }> => {
      const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
      const { nameMap, decorate, decidableUserIds } = await import(
        "@/lib/leaves/leaves.server"
      );
      const companyId = await assertModuleEnabled(
        context.supabase,
        context.userId,
        "leaves",
      );
      const today = new Date().toISOString().slice(0, 10);
      const year = new Date().getFullYear();

      const [{ data: types }, { data: mineRows }, { data: teamRows }, { data: balances }] =
        await Promise.all([
          context.supabase.from("leave_types").select("id, name"),
          context.supabase
            .from("leave_requests")
            .select("*")
            .eq("user_id", context.userId)
            .order("start_date", { ascending: false })
            .limit(50),
          context.supabase
            .from("leave_requests")
            .select("*")
            .eq("company_id", companyId)
            .neq("user_id", context.userId)
            .eq("status", "approved")
            .gte("end_date", today)
            .order("start_date", { ascending: true })
            .limit(20),
          context.supabase
            .from("leave_balances")
            .select("type_id, year, allocated_days, used_days")
            .eq("user_id", context.userId)
            .eq("year", year),
        ]);

      const typeNames = Object.fromEntries(
        (types ?? []).map((t: any) => [t.id, t.name]),
      );
      const decidable = await decidableUserIds(
        context.supabase,
        companyId,
        context.userId,
      );
      const all = [...(mineRows ?? []), ...(teamRows ?? [])] as any[];
      const names = await nameMap(
        context.supabase,
        all.flatMap((r) => [r.user_id, r.current_approver_id]),
      );

      const { count } = await context.supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "submitted")
        .eq("current_approver_id", context.userId);

      const opts = {
        viewerId: context.userId,
        names,
        typeNames,
        decidableUserIds: decidable,
      };
      return {
        balances: (balances ?? []).map((b: any) => ({
          type_id: b.type_id,
          type_name: typeNames[b.type_id] ?? "Congé",
          year: b.year,
          allocated_days: Number(b.allocated_days ?? 0),
          used_days: Number(b.used_days ?? 0),
        })),
        mine: decorate(mineRows ?? [], opts),
        team: decorate(teamRows ?? [], opts),
        pendingCount: count ?? 0,
      };
    },
  );

export const listPendingLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveRequest[]> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { nameMap, decorate, decidableUserIds } = await import(
      "@/lib/leaves/leaves.server"
    );
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "leaves",
    );
    const decidable = await decidableUserIds(
      context.supabase,
      companyId,
      context.userId,
    );
    if (decidable.size === 0) return [];

    const [{ data: rows }, { data: types }] = await Promise.all([
      context.supabase
        .from("leave_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "submitted")
        .in("user_id", Array.from(decidable))
        .order("start_date", { ascending: true }),
      context.supabase.from("leave_types").select("id, name"),
    ]);
    const names = await nameMap(
      context.supabase,
      (rows ?? []).flatMap((r: any) => [r.user_id, r.current_approver_id]),
    );
    return decorate(rows ?? [], {
      viewerId: context.userId,
      names,
      typeNames: Object.fromEntries((types ?? []).map((t: any) => [t.id, t.name])),
      decidableUserIds: decidable,
    });
  });

export const listTeamAbsences = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string }) =>
    z.object({ from: z.string().min(8), to: z.string().min(8) }).parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<LeaveRequest[]> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { nameMap, decorate, decidableUserIds } = await import(
      "@/lib/leaves/leaves.server"
    );
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "leaves",
    );
    const [{ data: rows }, { data: types }] = await Promise.all([
      context.supabase
        .from("leave_requests")
        .select("*")
        .eq("company_id", companyId)
        .in("status", ["submitted", "approved"])
        .lte("start_date", data.to)
        .gte("end_date", data.from)
        .order("start_date", { ascending: true }),
      context.supabase.from("leave_types").select("id, name"),
    ]);
    const decidable = await decidableUserIds(
      context.supabase,
      companyId,
      context.userId,
    );
    const names = await nameMap(
      context.supabase,
      (rows ?? []).flatMap((r: any) => [r.user_id, r.current_approver_id]),
    );
    return decorate(rows ?? [], {
      viewerId: context.userId,
      names,
      typeNames: Object.fromEntries((types ?? []).map((t: any) => [t.id, t.name])),
      decidableUserIds: decidable,
    });
  });

const RequestInput = z.object({
  typeId: z.string().uuid(),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  halfStart: z.boolean().default(false),
  halfEnd: z.boolean().default(false),
  reason: z.string().trim().max(2000).optional(),
  proofPath: z.string().trim().max(500).nullable().optional(),
  submit: z.boolean().default(true),
});

export const createLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RequestInput.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ id: string; overlaps: string[] }> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { resolveApprover, nameMap } = await import("@/lib/leaves/leaves.server");
    const { countLeaveDays } = await import("@/lib/leaves/types");
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "leaves",
    );
    if (data.endDate < data.startDate)
      throw new Error("La date de fin doit suivre la date de début.");

    const days = countLeaveDays(
      data.startDate,
      data.endDate,
      data.halfStart,
      data.halfEnd,
    );
    if (days <= 0) throw new Error("La période sélectionnée ne contient aucun jour ouvré.");

    const { data: type } = await context.supabase
      .from("leave_types")
      .select("requires_proof, name")
      .eq("id", data.typeId)
      .maybeSingle();
    if (!type) throw new Error("Type de congé introuvable.");
    if ((type as any).requires_proof && !data.proofPath && data.submit)
      throw new Error(`Un justificatif est requis pour « ${(type as any).name} ».`);

    const approver = data.submit
      ? await resolveApprover(context.supabase, companyId, context.userId)
      : null;

    const { data: inserted, error } = await context.supabase
      .from("leave_requests")
      .insert({
        company_id: companyId,
        user_id: context.userId,
        employee_id: context.userId,
        type_id: data.typeId,
        start_date: data.startDate,
        end_date: data.endDate,
        half_start: data.halfStart,
        half_end: data.halfEnd,
        days_count: days,
        reason: data.reason || null,
        proof_path: data.proofPath || null,
        status: data.submit ? "submitted" : "draft",
        current_approver_id: approver,
        submitted_at: data.submit ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Chevauchements dans le même service (information, pas blocage)
    const { data: me } = await context.supabase
      .from("company_members")
      .select("department")
      .eq("company_id", companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    let overlaps: string[] = [];
    const dept = (me as any)?.department as string | null;
    if (dept) {
      const { data: colleagues } = await context.supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("department", dept)
        .neq("user_id", context.userId);
      const ids = (colleagues ?? []).map((c: any) => c.user_id);
      if (ids.length > 0) {
        const { data: clash } = await context.supabase
          .from("leave_requests")
          .select("user_id")
          .in("user_id", ids)
          .in("status", ["submitted", "approved"])
          .lte("start_date", data.endDate)
          .gte("end_date", data.startDate);
        const names = await nameMap(
          context.supabase,
          (clash ?? []).map((c: any) => c.user_id),
        );
        overlaps = Array.from(
          new Set((clash ?? []).map((c: any) => names[c.user_id] || "Un collègue")),
        );
      }
    }

    if (approver) {
      const { notify } = await import("@/lib/notifications.server");
      const requester = await nameMap(context.supabase, [context.userId]);
      await notify([
        {
          user_id: approver,
          type: "leave_submitted",
          title: "Demande d'absence à valider",
          body: `${requester[context.userId] || "Un collaborateur"} — ${(type as any).name}, ${days} j`,
          actor_id: context.userId,
        },
      ]);
    }

    return { id: (inserted as any).id as string, overlaps };
  });

export const submitLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { resolveApprover, nameMap } = await import("@/lib/leaves/leaves.server");
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "leaves",
    );
    const { data: row } = await context.supabase
      .from("leave_requests")
      .select("id, user_id, status, days_count, type_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || (row as any).user_id !== context.userId)
      throw new Error("Demande introuvable.");
    if ((row as any).status !== "draft")
      throw new Error("Seul un brouillon peut être soumis.");

    const approver = await resolveApprover(context.supabase, companyId, context.userId);
    const { error } = await context.supabase
      .from("leave_requests")
      .update({
        status: "submitted",
        current_approver_id: approver,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (approver) {
      const { notify } = await import("@/lib/notifications.server");
      const names = await nameMap(context.supabase, [context.userId]);
      await notify([
        {
          user_id: approver,
          type: "leave_submitted",
          title: "Demande d'absence à valider",
          body: `${names[context.userId] || "Un collaborateur"} — ${Number((row as any).days_count)} j`,
          actor_id: context.userId,
        },
      ]);
    }
    return { ok: true };
  });

export const cancelLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "leaves");
    const { data: row } = await context.supabase
      .from("leave_requests")
      .select("id, user_id, status, type_id, days_count, company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || (row as any).user_id !== context.userId)
      throw new Error("Demande introuvable.");
    if (!["draft", "submitted", "approved"].includes((row as any).status))
      throw new Error("Cette demande ne peut plus être annulée.");

    const { error } = await context.supabase
      .from("leave_requests")
      .update({ status: "cancelled", current_approver_id: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if ((row as any).status === "approved") {
      const { releaseBalance } = await import("@/lib/leaves/balances.server");
      await releaseBalance(
        (row as any).company_id,
        context.userId,
        (row as any).type_id,
        Number((row as any).days_count),
      );
    }
    return { ok: true };
  });

export const deleteLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "leaves");
    const { error } = await context.supabase
      .from("leave_requests")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { canDecide } = await import("@/lib/leaves/leaves.server");
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "leaves",
    );
    const { data: row } = await context.supabase
      .from("leave_requests")
      .select("id, user_id, status, type_id, days_count, start_date, end_date")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Demande introuvable.");
    if ((row as any).status !== "submitted")
      throw new Error("Cette demande a déjà été traitée.");
    const allowed = await canDecide(
      context.supabase,
      companyId,
      context.userId,
      (row as any).user_id,
    );
    if (!allowed) throw new Error("Vous n'êtes pas habilité à valider cette demande.");

    // Écriture via le client service : les colonnes de décision sont protégées
    // par le trigger guard_privileged_columns (accès direct PostgREST bloqué).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: decided, error } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: data.decision,
        current_approver_id: null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "submitted")
      .select("id");
    if (error) throw new Error(error.message);
    if (!decided || decided.length === 0) throw new Error("Cette demande a déjà été traitée.");

    await context.supabase.from("leave_approvals").insert({
      request_id: data.id,
      approver_id: context.userId,
      level: 1,
      decision: data.decision,
      comment: data.comment || null,
    });

    if (data.decision === "approved") {
      const { consumeBalance } = await import("@/lib/leaves/balances.server");
      await consumeBalance(
        companyId,
        (row as any).user_id,
        (row as any).type_id,
        Number((row as any).days_count),
      );
    }

    const { notify } = await import("@/lib/notifications.server");
    await notify([
      {
        user_id: (row as any).user_id,
        type: data.decision === "approved" ? "leave_approved" : "leave_rejected",
        title:
          data.decision === "approved"
            ? "Absence validée"
            : "Demande d'absence refusée",
        body: data.comment || null,
        actor_id: context.userId,
      },
    ]);
    return { ok: true };
  });

export const leaveProofUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { canDecide } = await import("@/lib/leaves/leaves.server");
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "leaves",
    );
    const { data: row } = await context.supabase
      .from("leave_requests")
      .select("user_id, proof_path")
      .eq("id", data.id)
      .maybeSingle();
    const path = (row as any)?.proof_path as string | null;
    if (!row || !path) throw new Error("Aucun justificatif.");
    const mine = (row as any).user_id === context.userId;
    if (
      !mine &&
      !(await canDecide(context.supabase, companyId, context.userId, (row as any).user_id))
    )
      throw new Error("Accès refusé.");

    const { data: signed, error } = await context.supabase.storage
      .from("leave-proofs")
      .createSignedUrl(path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Lien indisponible.");
    return { url: signed.signedUrl };
  });
