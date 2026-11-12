import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  LoadedAttachment,
  LoadedImage,
  LoadedReport,
  LoadedSection,
  ReportListItem,
} from "./reports.types";

const IMAGE_URL_TTL = 5 * 60; // Leave time to read before exporting or opening attachments.
const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_SHARE_DAYS = 30; // durée max d'un lien de partage public


const bulletSchema = z.object({
  content: z.string().default(""),
  position: z.number().int().default(0),
});
const imageSchema = z.object({
  storage_path: z.string().min(1),
  section_index: z.number().int().nullable().default(null),
  position: z.number().int().default(0),
  caption: z.string().default(""),
});
const attachmentSchema = z.object({
  storage_path: z.string().min(1),
  section_index: z.number().int().nullable().default(null),
  position: z.number().int().default(0),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().nonnegative().max(ATTACHMENT_MAX_BYTES),
});
const sectionSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  position: z.number().int().default(0),
  bullets: z.array(bulletSchema).default([]),
});
const budgetLineSchema = z.object({
  category: z.string().max(120).default(""),
  label: z.string().max(300).default(""),
  unit: z.string().max(40).default(""),
  quantity: z.number().default(0),
  unit_price: z.number().default(0),
  planned_amount: z.number().default(0),
  actual_amount: z.number().default(0),
  notes: z.string().max(500).default(""),
  position: z.number().int().default(0),
});
const reportInputSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1, "Le titre est requis"),
  intro: z.string().default(""),
  conclusion: z.string().default(""),
  sections: z.array(sectionSchema).default([]),
  images: z.array(imageSchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
  doc_type: z
    .enum(["report", "budget", "quote", "proforma", "invoice"])
    .default("report"),
  doc_number: z.string().max(60).default(""),
  currency: z.string().max(8).default("XOF"),
  tax_rate: z.number().min(0).max(100).default(0),
  period_label: z.string().max(120).default(""),
  counterparty: z.string().max(200).default(""),
  budget_lines: z.array(budgetLineSchema).default([]),
});

type ReportInput = z.infer<typeof reportInputSchema>;

function docFieldsOf(data: ReportInput) {
  return {
    doc_type: data.doc_type,
    doc_number: data.doc_number || null,
    currency: data.currency || "XOF",
    tax_rate: data.tax_rate ?? 0,
    period_label: data.period_label || null,
    counterparty: data.counterparty || null,
  };
}

async function nextDocNumber(
  supabase: any,
  userId: string,
  docType: string,
): Promise<string> {
  const { buildDocNumber, DOC_TYPE_PREFIX } = await import("./budget");
  const year = new Date().getFullYear();
  const prefix = `${(DOC_TYPE_PREFIX as any)[docType] ?? "DOC"}-${year}-`;
  const { data } = await supabase
    .from("reports")
    .select("doc_number")
    .eq("author_id", userId)
    .eq("doc_type", docType)
    .like("doc_number", `${prefix}%`)
    .order("doc_number", { ascending: false })
    .limit(1);
  const last = (data ?? [])[0]?.doc_number as string | undefined;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return buildDocNumber(docType as any, year, Number.isFinite(seq) ? seq : 1);
}


async function signBucket(
  supabase: any,
  bucket: string,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, IMAGE_URL_TTL);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry: any) => {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  });
  return map;
}

async function signImages(supabase: any, paths: string[]) {
  return signBucket(supabase, "report-images", paths);
}
async function signAttachments(supabase: any, paths: string[]) {
  return signBucket(supabase, "report-attachments", paths);
}

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReportListItem[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("reports")
      .select("id, author_id, report_date, title, intro, created_at, doc_type, doc_number, period_start, period_end")
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const authorIds = Array.from(new Set(rows.map((r: any) => r.author_id)));
    let profiles: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", authorIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p: any) => [p.id, p.full_name || "Utilisateur"]),
      );
    }
    return rows.map((r: any) => ({
      id: r.id,
      author_id: r.author_id,
      author_name: profiles[r.author_id] ?? "Utilisateur",
      report_date: r.report_date,
      title: r.title,
      intro: r.intro ?? "",
      created_at: r.created_at,
      doc_type: (r.doc_type ?? "report") as any,
      doc_number: r.doc_number ?? null,
      period_start: r.period_start ?? null,
      period_end: r.period_end ?? null,
    }));

  });

export const getReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<LoadedReport> => {
    const { supabase } = context;
    const [
      { data: report, error: e1 },
      { data: sections },
      { data: images },
      { data: attachments },
      { data: budgetLines },
    ] =
      await Promise.all([
        supabase.from("reports").select("*").eq("id", data.id).maybeSingle(),
        supabase
          .from("report_sections")
          .select("id, title, description, position, report_id")
          .eq("report_id", data.id)
          .order("position", { ascending: true }),
        supabase
          .from("report_images")
          .select("id, storage_path, section_id, position, caption")
          .eq("report_id", data.id)
          .order("position", { ascending: true }),
        supabase
          .from("report_attachments")
          .select("id, storage_path, section_id, position, file_name, mime_type, size_bytes")
          .eq("report_id", data.id)
          .order("position", { ascending: true }),
        supabase
          .from("report_budget_lines")
          .select(
            "id, category, label, unit, quantity, unit_price, planned_amount, actual_amount, notes, position",
          )
          .eq("report_id", data.id)
          .order("position", { ascending: true }),
      ]);
    if (e1) throw new Error(e1.message);
    if (!report) throw new Error("Rapport introuvable");


    const sectionIds = (sections ?? []).map((s: any) => s.id);
    const [{ data: bullets }, { data: profile }] = await Promise.all([
      sectionIds.length
        ? supabase
            .from("section_bullets")
            .select("id, section_id, content, position")
            .in("section_id", sectionIds)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("profiles_public")
        .select("id, full_name")
        .eq("id", report.author_id)
        .maybeSingle(),
    ]);

    const paths = (images ?? []).map((i: any) => i.storage_path);
    const urls = await signImages(supabase, paths);
    const attPaths = (attachments ?? []).map((a: any) => a.storage_path);
    const attUrls = await signAttachments(supabase, attPaths);

    const bulletsBySection: Record<string, any[]> = {};
    (bullets ?? []).forEach((b: any) => {
      (bulletsBySection[b.section_id] ??= []).push(b);
    });
    const imagesBySection: Record<string, LoadedImage[]> = {};
    const generalImages: LoadedImage[] = [];
    (images ?? []).forEach((img: any) => {
      const li: LoadedImage = {
        id: img.id,
        storage_path: img.storage_path,
        section_id: img.section_id,
        position: img.position,
        caption: img.caption ?? "",
        url: urls[img.storage_path] ?? "",
      };
      if (img.section_id) (imagesBySection[img.section_id] ??= []).push(li);
      else generalImages.push(li);
    });
    const attsBySection: Record<string, LoadedAttachment[]> = {};
    const generalAttachments: LoadedAttachment[] = [];
    (attachments ?? []).forEach((att: any) => {
      const la: LoadedAttachment = {
        id: att.id,
        storage_path: att.storage_path,
        section_id: att.section_id,
        position: att.position,
        file_name: att.file_name,
        mime_type: att.mime_type,
        size_bytes: Number(att.size_bytes),
        url: attUrls[att.storage_path] ?? "",
      };
      if (att.section_id) (attsBySection[att.section_id] ??= []).push(la);
      else generalAttachments.push(la);
    });

    const loadedSections: LoadedSection[] = (sections ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      position: s.position,
      bullets: (bulletsBySection[s.id] ?? []).map((b: any) => ({
        id: b.id,
        content: b.content,
        position: b.position,
      })),
      images: imagesBySection[s.id] ?? [],
      attachments: attsBySection[s.id] ?? [],
    }));

    return {
      id: report.id,
      author_id: report.author_id,
      author_name: profile?.full_name || "Utilisateur",
      author_email: "",
      report_date: report.report_date,
      title: report.title,
      intro: report.intro ?? "",
      conclusion: report.conclusion ?? "",
      created_at: report.created_at,
      updated_at: report.updated_at,
      sections: loadedSections,
      general_images: generalImages,
      general_attachments: generalAttachments,
      status: report.status ?? null,
      kind: report.kind ?? null,
      doc_type: (report.doc_type ?? "report") as any,
      doc_number: report.doc_number ?? "",
      currency: report.currency ?? "XOF",
      tax_rate: Number(report.tax_rate ?? 0),
      period_label: report.period_label ?? "",
      counterparty: report.counterparty ?? "",
      budget_lines: mapBudgetLines(budgetLines),
      signature: (report as any).signed_at
        ? {
            signature_image: (report as any).signature_image ?? null,
            stamp_image: (report as any).stamp_image ?? null,
            signer_name: (report as any).signer_name ?? "",
            signer_role: (report as any).signer_role ?? "",
            signed_at: (report as any).signed_at,
          }
        : null,
    } as LoadedReport;
  });

const dataUrl = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,/)
  .nullable();

export const signReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        clear: z.boolean().optional(),
        signature_image: dataUrl.optional(),
        stamp_image: dataUrl.optional(),
        signer_name: z.string().max(120).optional(),
        signer_role: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = data.clear
      ? { signature_image: null, stamp_image: null, signer_name: null, signer_role: null, signed_at: null }
      : {
          signature_image: data.signature_image ?? null,
          stamp_image: data.stamp_image ?? null,
          signer_name: data.signer_name ?? "",
          signer_role: data.signer_role ?? "",
          signed_at: new Date().toISOString(),
        };
    // Seul l'auteur peut apposer sa signature. L'écriture passe ensuite par le
    // client service, car le trigger guard_privileged_columns protège ces colonnes.
    const { data: owned } = await context.supabase
      .from("reports")
      .select("id")
      .eq("id", data.id)
      .eq("author_id", context.userId)
      .maybeSingle();
    if (!owned) throw new Error("Rapport introuvable ou non autorisé");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("reports")
      .update(patch as any)
      .eq("id", data.id)
      .eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function mapBudgetLines(rows: any[] | null | undefined) {
  return (rows ?? []).map((l: any) => ({
    id: l.id,
    category: l.category ?? "",
    label: l.label ?? "",
    unit: l.unit ?? "",
    quantity: Number(l.quantity ?? 0),
    unit_price: Number(l.unit_price ?? 0),
    planned_amount: Number(l.planned_amount ?? 0),
    actual_amount: Number(l.actual_amount ?? 0),
    notes: l.notes ?? "",
    position: Number(l.position ?? 0),
  }));
}


async function persistChildren(
  supabase: any,
  reportId: string,
  input: ReportInput,
) {
  // Wipe children (RLS ensures only own report)
  await supabase.from("report_sections").delete().eq("report_id", reportId);
  await supabase.from("report_images").delete().eq("report_id", reportId);
  await supabase.from("report_attachments").delete().eq("report_id", reportId);
  await supabase.from("report_budget_lines").delete().eq("report_id", reportId);

  const budgetInserts = (input.budget_lines ?? [])
    .filter((l) => (l.label ?? "").trim() || l.quantity || l.unit_price || l.planned_amount || l.actual_amount)
    .map((l, idx) => ({
      report_id: reportId,
      category: l.category ?? "",
      label: l.label ?? "",
      unit: l.unit ?? "",
      quantity: l.quantity ?? 0,
      unit_price: l.unit_price ?? 0,
      planned_amount: l.planned_amount ?? 0,
      actual_amount: l.actual_amount ?? 0,
      notes: l.notes ?? "",
      position: idx,
    }));
  if (budgetInserts.length > 0) {
    const { error } = await supabase.from("report_budget_lines").insert(budgetInserts);
    if (error) throw new Error(error.message);
  }


  // Insert sections and gather created IDs (ordered by position)
  const sectionInserts = input.sections.map((s, idx) => ({
    report_id: reportId,
    title: s.title,
    description: s.description,
    position: idx,
  }));
  let insertedSections: { id: string }[] = [];
  if (sectionInserts.length > 0) {
    const { data, error } = await supabase
      .from("report_sections")
      .insert(sectionInserts)
      .select("id");
    if (error) throw new Error(error.message);
    insertedSections = data ?? [];
  }

  const bulletInserts: any[] = [];
  input.sections.forEach((s, sIdx) => {
    const secId = insertedSections[sIdx]?.id;
    if (!secId) return;
    s.bullets.forEach((b, bIdx) => {
      const content = (b.content ?? "").trim();
      if (!content) return;
      bulletInserts.push({ section_id: secId, content, position: bIdx });
    });
  });
  if (bulletInserts.length > 0) {
    const { error } = await supabase.from("section_bullets").insert(bulletInserts);
    if (error) throw new Error(error.message);
  }

  const imageInserts = input.images.map((img, idx) => ({
    report_id: reportId,
    section_id:
      img.section_index !== null ? insertedSections[img.section_index]?.id ?? null : null,
    storage_path: img.storage_path,
    position: idx,
    caption: img.caption ?? "",
  }));
  if (imageInserts.length > 0) {
    const { error } = await supabase.from("report_images").insert(imageInserts);
    if (error) throw new Error(error.message);
  }

  const attachmentInserts = input.attachments.map((att, idx) => ({
    report_id: reportId,
    section_id:
      att.section_index !== null ? insertedSections[att.section_index]?.id ?? null : null,
    storage_path: att.storage_path,
    file_name: att.file_name,
    mime_type: att.mime_type,
    size_bytes: att.size_bytes,
    position: idx,
  }));
  if (attachmentInserts.length > 0) {
    const { error } = await supabase.from("report_attachments").insert(attachmentInserts);
    if (error) throw new Error(error.message);
  }
}

/**
 * Empêche l'injection de chemins Storage arbitraires : une image ou une pièce
 * jointe doit appartenir au dossier de son auteur (`<uid>/…`) ou déjà être
 * rattachée au rapport en cours d'édition. Sans ce contrôle, un rapport partagé
 * permettait de faire signer par le service_role le fichier d'un autre tenant.
 */
async function assertStoragePathsAllowed(
  supabase: any,
  userId: string,
  reportId: string | null,
  paths: string[],
) {
  const suspicious = Array.from(
    new Set(paths.filter((p) => !p.startsWith(`${userId}/`) || p.includes(".."))),
  );
  if (suspicious.length === 0) return;
  if (!reportId) throw new Error("Fichier non autorisé : chemin de stockage invalide.");

  const [{ data: imgs }, { data: atts }] = await Promise.all([
    supabase
      .from("report_images")
      .select("storage_path")
      .eq("report_id", reportId)
      .in("storage_path", suspicious),
    supabase
      .from("report_attachments")
      .select("storage_path")
      .eq("report_id", reportId)
      .in("storage_path", suspicious),
  ]);
  const known = new Set<string>([
    ...((imgs ?? []) as any[]).map((r) => r.storage_path),
    ...((atts ?? []) as any[]).map((r) => r.storage_path),
  ]);
  if (suspicious.some((p) => !known.has(p))) {
    throw new Error("Fichier non autorisé : chemin de stockage invalide.");
  }
}

export const upsertReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reportInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let reportId: string;
    const docFields = docFieldsOf(data);
    await assertStoragePathsAllowed(supabase, userId, data.id ?? null, [
      ...data.images.map((i) => i.storage_path),
      ...data.attachments.map((a) => a.storage_path),
    ]);
    if (data.id) {
      const { data: upd, error } = await supabase
        .from("reports")
        .update({
          report_date: data.report_date,
          title: data.title,
          intro: data.intro,
          conclusion: data.conclusion,
          ...docFields,
        })
        .eq("id", data.id)
        .eq("author_id", userId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!upd) throw new Error("Rapport introuvable ou non autorisé");
      reportId = upd.id;
    } else {
      if (!docFields.doc_number && data.doc_type !== "report") {
        docFields.doc_number = await nextDocNumber(supabase, userId, data.doc_type);
      }
      const { data: ins, error } = await supabase
        .from("reports")
        .insert({
          author_id: userId,
          report_date: data.report_date,
          title: data.title,
          intro: data.intro,
          conclusion: data.conclusion,
          ...docFields,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      reportId = ins.id;
    }
    await persistChildren(supabase, reportId, data);
    return { id: reportId };
  });


export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", data.id)
      .eq("author_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (data) return data;
    const email = (claims as any)?.email ?? null;
    const { data: created, error } = await supabase
      .from("profiles")
      .insert({ id: userId, email, full_name: email?.split("@")[0] ?? "" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { full_name?: string; avatar_url?: string | null }) =>
    z
      .object({ full_name: z.string().optional(), avatar_url: z.string().nullable().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof, error } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return prof;
  });

// ---- Duplicate ----
export const duplicateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src, error: e1 } = await supabase
      .from("reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Rapport introuvable");

    const srcDocType = ((src as any).doc_type ?? "report") as string;
    const newDocNumber =
      srcDocType === "report" ? null : await nextDocNumber(supabase, userId, srcDocType);

    const { data: newRep, error: e2 } = await supabase
      .from("reports")
      .insert({
        author_id: userId,
        report_date: src.report_date,
        title: `${src.title} (copie)`,
        intro: src.intro ?? "",
        conclusion: src.conclusion ?? "",
        doc_type: srcDocType,
        doc_number: newDocNumber,
        currency: (src as any).currency ?? "XOF",
        tax_rate: (src as any).tax_rate ?? 0,
        period_label: (src as any).period_label ?? null,
        counterparty: (src as any).counterparty ?? null,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);

    const { data: srcLines } = await supabase
      .from("report_budget_lines")
      .select(
        "category, label, unit, quantity, unit_price, planned_amount, actual_amount, notes, position",
      )
      .eq("report_id", data.id)
      .order("position", { ascending: true });
    if (srcLines && srcLines.length > 0) {
      await supabase
        .from("report_budget_lines")
        .insert(srcLines.map((l: any) => ({ ...l, report_id: newRep.id })));
    }


    const { data: sections } = await supabase
      .from("report_sections")
      .select("id, title, description, position")
      .eq("report_id", data.id)
      .order("position", { ascending: true });

    if (sections && sections.length > 0) {
      const inserts = sections.map((s: any) => ({
        report_id: newRep.id,
        title: s.title,
        description: s.description,
        position: s.position,
      }));
      const { data: newSecs, error: e3 } = await supabase
        .from("report_sections")
        .insert(inserts)
        .select("id");
      if (e3) throw new Error(e3.message);

      const idMap: Record<string, string> = {};
      sections.forEach((s: any, idx: number) => {
        idMap[s.id] = newSecs![idx].id;
      });

      const { data: bullets } = await supabase
        .from("section_bullets")
        .select("section_id, content, position")
        .in(
          "section_id",
          sections.map((s: any) => s.id),
        );
      if (bullets && bullets.length > 0) {
        const bInserts = bullets.map((b: any) => ({
          section_id: idMap[b.section_id],
          content: b.content,
          position: b.position,
        }));
        await supabase.from("section_bullets").insert(bInserts);
      }
    }

    return { id: newRep.id };
  });

// ---- Share token ----
function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

async function logAudit(
  admin: any,
  reportId: string,
  actorId: string | null,
  action:
    | "created"
    | "copied"
    | "revoked"
    | "regenerated"
    | "viewed"
    | "exported",
  ip: string | null,
  userAgent: string | null,
) {
  try {
    await admin.from("share_audit_log").insert({
      report_id: reportId,
      actor_id: actorId,
      action,
      ip,
      user_agent: userAgent,
    });
  } catch {
    // best-effort
  }
}

async function getRequestMeta(): Promise<{
  ip: string | null;
  ua: string | null;
}> {
  try {
    const mod: any = await import("@tanstack/react-start/server");
    const getHeader = mod.getRequestHeader ?? mod.getHeader;
    const ua = getHeader?.("user-agent") ?? null;
    const ip =
      getHeader?.("cf-connecting-ip") ??
      getHeader?.("x-forwarded-for") ??
      null;
    return {
      ip: typeof ip === "string" ? ip.split(",")[0].trim() : null,
      ua: typeof ua === "string" ? ua.slice(0, 300) : null,
    };
  } catch {
    return { ip: null, ua: null };
  }
}

export const getShareToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("reports")
      .select("share_token, share_expires_at, author_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Rapport introuvable");
    if (row.author_id !== userId) throw new Error("Non autorisé");
    return {
      token: (row.share_token as string | null) ?? null,
      expires_at: (row.share_expires_at as string | null) ?? null,
    };
  });

export const enableShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; expiresInDays?: number | null }) =>
      z
        .object({
          id: z.string().uuid(),
          expiresInDays: z
            .number()
            .int()
            .min(1)
            .max(MAX_SHARE_DAYS)
            .nullable()
            .optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("reports")
      .select("share_token, author_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Rapport introuvable");
    if (existing.author_id !== userId) throw new Error("Non autorisé");

    const token = randomToken();
    const expiresAt =
      data.expiresInDays && data.expiresInDays > 0
        ? new Date(
            Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000,
          ).toISOString()
        : null;
    const { data: upd, error } = await supabase
      .from("reports")
      .update({ share_token: token, share_expires_at: expiresAt })
      .eq("id", data.id)
      .eq("author_id", userId)
      .select("share_token, share_expires_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!upd) throw new Error("Non autorisé");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const meta = await getRequestMeta();
    await logAudit(
      supabaseAdmin,
      data.id,
      userId,
      existing.share_token ? "regenerated" : "created",
      meta.ip,
      meta.ua,
    );

    return {
      token: upd.share_token as string,
      expires_at: (upd.share_expires_at as string | null) ?? null,
    };
  });

export const revokeShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("reports")
      .update({ share_token: null, share_expires_at: null })
      .eq("id", data.id)
      .eq("author_id", userId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const meta = await getRequestMeta();
    await logAudit(supabaseAdmin, data.id, userId, "revoked", meta.ip, meta.ua);
    return { ok: true };
  });

export const logShareCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: owned } = await supabase
      .from("reports")
      .select("id")
      .eq("id", data.id)
      .eq("author_id", userId)
      .not("share_token", "is", null)
      .maybeSingle();
    if (!owned) throw new Error("Rapport introuvable");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const meta = await getRequestMeta();
    await logAudit(supabaseAdmin, data.id, userId, "copied", meta.ip, meta.ua);
    return { ok: true };
  });

export type ShareAuditEntry = {
  id: string;
  action: string;
  actor_id: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export const getShareAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ShareAuditEntry[]> => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("reports")
      .select("author_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.author_id !== userId) throw new Error("Non autorisé");
    const { data: rows, error } = await supabase
      .from("share_audit_log")
      .select("id, action, actor_id, ip, user_agent, created_at")
      .eq("report_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ShareAuditEntry[];
  });

// ---- Public read via share token ----
export const getSharedReport = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().min(8).max(64) }).parse(data),
  )
  .handler(async ({ data }): Promise<LoadedReport> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: report, error } = await supabaseAdmin
      .from("reports")
      .select("*")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!report) throw new Error("Lien de partage invalide");

    const { isShareLinkUsable } = await import("./hierarchy-tree");
    if (!isShareLinkUsable(report as any)) {
      throw new Error("Lien expiré");
    }

    const [
      { data: sections },
      { data: images },
      { data: attachments },
      { data: profile },
      { data: budgetLines },
    ] =
      await Promise.all([
        supabaseAdmin
          .from("report_sections")
          .select("id, title, description, position")
          .eq("report_id", report.id)
          .order("position", { ascending: true }),
        supabaseAdmin
          .from("report_images")
          .select("id, storage_path, section_id, position, caption")
          .eq("report_id", report.id)
          .order("position", { ascending: true }),
        supabaseAdmin
          .from("report_attachments")
          .select("id, storage_path, section_id, position, file_name, mime_type, size_bytes")
          .eq("report_id", report.id)
          .order("position", { ascending: true }),
        supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .eq("id", report.author_id)
          .maybeSingle(),
        supabaseAdmin
          .from("report_budget_lines")
          .select(
            "id, category, label, unit, quantity, unit_price, planned_amount, actual_amount, notes, position",
          )
          .eq("report_id", report.id)
          .order("position", { ascending: true }),
      ]);


    const sectionIds = (sections ?? []).map((s: any) => s.id);
    const { data: bullets } = sectionIds.length
      ? await supabaseAdmin
          .from("section_bullets")
          .select("id, section_id, content, position")
          .in("section_id", sectionIds)
          .order("position", { ascending: true })
      : { data: [] as any[] };

    // Ne jamais signer un chemin qui n'appartient pas à l'auteur du rapport :
    // un storage_path injecté ferait lire le fichier d'un autre tenant via le
    // client service_role (qui contourne les policies du bucket).
    const authorPrefix = `${report.author_id}/`;
    const scopedRows = (rows: any[] | null | undefined) =>
      (rows ?? []).filter(
        (r) =>
          typeof r.storage_path === "string" &&
          r.storage_path.startsWith(authorPrefix) &&
          !r.storage_path.includes(".."),
      );
    const safeImages = scopedRows(images);
    const safeAttachmentsList = scopedRows(attachments);

    const paths = safeImages.map((i: any) => i.storage_path);
    const urls = await signImages(supabaseAdmin, paths);
    const attPaths = safeAttachmentsList.map((a: any) => a.storage_path);
    const attUrls = await signAttachments(supabaseAdmin, attPaths);

    const bulletsBySection: Record<string, any[]> = {};
    (bullets ?? []).forEach((b: any) => {
      (bulletsBySection[b.section_id] ??= []).push(b);
    });
    const imagesBySection: Record<string, LoadedImage[]> = {};
    const generalImages: LoadedImage[] = [];
    safeImages.forEach((img: any) => {
      const li: LoadedImage = {
        id: img.id,
        storage_path: img.storage_path,
        section_id: img.section_id,
        position: img.position,
        caption: img.caption ?? "",
        url: urls[img.storage_path] ?? "",
      };
      if (img.section_id) (imagesBySection[img.section_id] ??= []).push(li);
      else generalImages.push(li);
    });
    const attsBySection: Record<string, LoadedAttachment[]> = {};
    const generalAttachments: LoadedAttachment[] = [];
    safeAttachmentsList.forEach((att: any) => {
      const la: LoadedAttachment = {
        id: att.id,
        storage_path: att.storage_path,
        section_id: att.section_id,
        position: att.position,
        file_name: att.file_name,
        mime_type: att.mime_type,
        size_bytes: Number(att.size_bytes),
        url: attUrls[att.storage_path] ?? "",
      };
      if (att.section_id) (attsBySection[att.section_id] ??= []).push(la);
      else generalAttachments.push(la);
    });

    const loadedSections: LoadedSection[] = (sections ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      position: s.position,
      bullets: (bulletsBySection[s.id] ?? []).map((b: any) => ({
        id: b.id,
        content: b.content,
        position: b.position,
      })),
      images: imagesBySection[s.id] ?? [],
      attachments: attsBySection[s.id] ?? [],
    }));

    const meta = await getRequestMeta();
    await logAudit(supabaseAdmin, report.id, null, "viewed", meta.ip, meta.ua);

    return {
      id: report.id,
      author_id: report.author_id,
      author_name: (profile as any)?.full_name || "Utilisateur",
      author_email: "",
      report_date: report.report_date,
      title: report.title,
      intro: report.intro ?? "",
      conclusion: report.conclusion ?? "",
      created_at: report.created_at,
      updated_at: report.updated_at,
      sections: loadedSections,
      general_images: generalImages,
      general_attachments: generalAttachments,
      share_expires_at: (report.share_expires_at as string | null) ?? null,
      doc_type: ((report as any).doc_type ?? "report") as any,
      doc_number: (report as any).doc_number ?? "",
      currency: (report as any).currency ?? "XOF",
      tax_rate: Number((report as any).tax_rate ?? 0),
      period_label: (report as any).period_label ?? "",
      counterparty: (report as any).counterparty ?? "",
      budget_lines: mapBudgetLines(budgetLines as any),
    } as LoadedReport;

  });

export const logSharedExport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().min(8).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rep } = await supabaseAdmin
      .from("reports")
      .select("id, share_expires_at")
      .eq("share_token", data.token)
      .maybeSingle();
    if (!rep) return { ok: false };
    const { isShareLinkUsable } = await import("./hierarchy-tree");
    if (!isShareLinkUsable({ share_token: data.token, share_expires_at: rep.share_expires_at as string | null })) {
      return { ok: false };
    }
    const meta = await getRequestMeta();
    await logAudit(supabaseAdmin, rep.id, null, "exported", meta.ip, meta.ua);
    return { ok: true };
  });

