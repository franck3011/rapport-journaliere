import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Inventaire par département.
 *
 * Lecture et écriture passent par la session de l'utilisateur : la RLS limite
 * déjà tout à son entreprise. Aucune clé de service ici.
 */

async function myCompanyId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Vous devez appartenir à une entreprise.");
  return data.company_id as string;
}

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any): Promise<any[]> => {
    const { data, error } = await context.supabase
      .from("company_departments")
      .select("id, name, created_at")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().trim().min(2).max(80) }).parse(d),
  )
  .handler(async ({ data, context }: any): Promise<{ id: string }> => {
    const companyId = await myCompanyId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("company_departments")
      .insert({ company_id: companyId, name: data.name, created_by: context.userId })
      .select("id")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error("Un département porte déjà ce nom.");
      }
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }: any): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("company_departments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInventoryItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ departmentId: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }: any): Promise<any[]> => {
    let query = context.supabase
      .from("company_inventory_items")
      .select("id, department_id, name, category, quantity, serial_number, assigned_to, status, notes, updated_at")
      .order("name", { ascending: true })
      .limit(500);

    if (data?.departmentId) query = query.eq("department_id", data.departmentId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ItemInput = z.object({
  id: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional().default(""),
  quantity: z.number().int().min(0).max(100000).optional().default(1),
  serialNumber: z.string().trim().max(120).optional().default(""),
  status: z.enum(["in_service", "repair", "retired", "missing"]).optional().default("in_service"),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const saveInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ItemInput.parse(d))
  .handler(async ({ data, context }: any): Promise<{ id: string }> => {
    const companyId = await myCompanyId(context.supabase, context.userId);
    const { assertCanWrite } = await import("@/lib/subscription.server");
    await assertCanWrite({ supabase: context.supabase, userId: context.userId });
    const payload = {
      company_id: companyId,
      department_id: data.departmentId ?? null,
      name: data.name,
      category: data.category ?? "",
      quantity: data.quantity ?? 1,
      serial_number: data.serialNumber ?? "",
      status: data.status ?? "in_service",
      notes: data.notes ?? "",
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("company_inventory_items")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await context.supabase
      .from("company_inventory_items")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }: any): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("company_inventory_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
