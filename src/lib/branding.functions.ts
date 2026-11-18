import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Identité visuelle : le logo appartient à l'entreprise et n'est modifiable
 * que par son propriétaire. L'avatar personnel reste, lui, dans le profil.
 */

export type CompanyBranding = {
  companyId: string | null;
  companyName: string | null;
  logoUrl: string | null;
  isOwner: boolean;
};

const EMPTY: CompanyBranding = {
  companyId: null,
  companyName: null,
  logoUrl: null,
  isOwner: false,
};

export const getMyCompanyBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyBranding> => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem?.company_id) return EMPTY;

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, logo_url, owner_id")
      .eq("id", mem.company_id)
      .maybeSingle();
    if (!company) return EMPTY;

    return {
      companyId: company.id,
      companyName: company.name ?? null,
      logoUrl: company.logo_url ?? null,
      isOwner: company.owner_id === userId,
    };
  });

export const setCompanyLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        logoUrl: z.string().url().max(2000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const userId: string = context.userId;

    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem?.company_id) throw new Error("Vous devez appartenir à une entreprise.");

    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", mem.company_id)
      .maybeSingle();
    if (company?.owner_id !== userId) {
      throw new Error("Seul le propriétaire de l'entreprise peut changer le logo.");
    }

    const { error } = await supabase
      .from("companies")
      .update({ logo_url: data.logoUrl })
      .eq("id", mem.company_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
