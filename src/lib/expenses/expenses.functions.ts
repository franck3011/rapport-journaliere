import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ExpenseRow } from "@/lib/expenses/expenses.server";

export type { ExpenseRow };

const BUCKET = "expense-receipts";

async function decorate(supabase: any, rows: any[]): Promise<ExpenseRow[]> {
  const { nameMap } = await import("@/lib/documents/documents.server");
  const names = await nameMap(supabase, rows.map((r) => r.author_id));
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
    author_name: r.author_id ? names[r.author_id] ?? null : null,
  })) as ExpenseRow[];
}

export const listMyExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExpenseRow[]> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "expenses");
    const { data, error } = await context.supabase
      .from("expense_reports")
      .select("*")
      .eq("author_id", context.userId)
      .order("expense_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return decorate(context.supabase, data ?? []);
  });

export const listExpensesToApprove = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExpenseRow[]> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "expenses");
    const { data, error } = await context.supabase
      .from("expense_reports")
      .select("*")
      .neq("author_id", context.userId)
      .in("status", ["submitted", "En attente"])
      .order("expense_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return decorate(context.supabase, data ?? []);
  });

const ExpenseInput = z.object({
  title: z.string().trim().min(2).max(200),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().min(1).max(8).default("XOF"),
  expenseDate: z.string().min(8).max(10),
  category: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
  receiptPath: z.string().max(400).nullable().optional(),
  submit: z.boolean().default(true),
});

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExpenseInput.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    if (
      data.receiptPath &&
      (!data.receiptPath.startsWith(`${context.userId}/`) || data.receiptPath.includes(".."))
    )
      throw new Error("Chemin de justificatif invalide");
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { resolveApprover } = await import("@/lib/leaves/leaves.server");
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "expenses",
    );
    const approver = await resolveApprover(
      context.supabase,
      companyId,
      context.userId,
    );

    const { data: row, error } = await context.supabase
      .from("expense_reports")
      .insert({
        company_id: companyId,
        author_id: context.userId,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        expense_date: data.expenseDate,
        category: data.category ?? null,
        description: data.description ?? null,
        receipt_url: data.receiptPath ?? null,
        status: data.submit ? "submitted" : "draft",
        manager_id: approver,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.submit && approver) {
      const { notify } = await import("@/lib/notifications.server");
      await notify([
        {
          user_id: approver,
          type: "expense_submitted",
          title: "Nouvelle note de frais à valider",
          body: `${data.title} — ${data.amount} ${data.currency}`,
          actor_id: context.userId,
        },
      ]);
    }
    return { id: row!.id as string };
  });

export const submitExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "expenses");
    const { error } = await context.supabase
      .from("expense_reports")
      .update({ status: "submitted" })
      .eq("id", data.id)
      .eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean; comment?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        comment: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    const { canDecide } = await import("@/lib/leaves/leaves.server");
    const companyId = await assertModuleEnabled(
      context.supabase,
      context.userId,
      "expenses",
    );
    const { data: row } = await context.supabase
      .from("expense_reports")
      .select("id, author_id, title")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Note de frais introuvable");
    const allowed = await canDecide(
      context.supabase,
      companyId,
      context.userId,
      (row as any).author_id,
    );
    if (!allowed) throw new Error("Vous n'êtes pas responsable de cet employé");

    // Écriture via le client service : les colonnes de décision sont protégées
    // par le trigger guard_privileged_columns (accès direct PostgREST bloqué).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: decided, error } = await supabaseAdmin
      .from("expense_reports")
      .update({
        status: data.approve ? "approved" : "rejected",
        decision_comment: data.comment ?? null,
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
      })
      .eq("id", data.id)
      .in("status", ["submitted", "En attente"])
      .select("id");
    if (error) throw new Error(error.message);
    if (!decided || decided.length === 0) throw new Error("Cette note de frais a déjà été traitée.");

    const { notify } = await import("@/lib/notifications.server");
    await notify([
      {
        user_id: (row as any).author_id,
        type: data.approve ? "expense_approved" : "expense_rejected",
        title: data.approve ? "Note de frais approuvée" : "Note de frais refusée",
        body: (row as any).title,
        actor_id: context.userId,
      },
    ]);
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "expenses");
    const { error } = await context.supabase
      .from("expense_reports")
      .delete()
      .eq("id", data.id)
      .eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { assertModuleEnabled } = await import("@/lib/modules/modules.server");
    await assertModuleEnabled(context.supabase, context.userId, "expenses");
    const { data: row } = await context.supabase
      .from("expense_reports")
      .select("receipt_url, author_id")
      .eq("id", data.id)
      .maybeSingle();
    const path = (row as any)?.receipt_url as string | null;
    if (!path) throw new Error("Aucun justificatif");
    if (!path.startsWith(`${(row as any).author_id}/`) || path.includes(".."))
      throw new Error("Justificatif non autorisé");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Lien indisponible");
    return { url: signed.signedUrl };
  });
