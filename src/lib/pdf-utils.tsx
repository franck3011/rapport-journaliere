import { getBrandingLogo } from "@/lib/branding";
import "./buffer-polyfill";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
} from "@react-pdf/renderer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Font } from "@react-pdf/renderer";
Font.registerHyphenationCallback((word) => [word]);
const REPORT_LOGO_URL = () => {
  // Priorite au logo de l'entreprise ; repli sur le logo DailyBrief.
  const company = getBrandingLogo();
  if (company) return company;
  return `${typeof window !== "undefined" ? window.location.origin : ""}/logo-mbc.png`;
};
import type { ApprovalEntry, LoadedReport } from "./reports.types";
import { REPORT_STATUS_LABEL, levelLabel } from "./reports.types";
import type { ReportMinute } from "./minutes.functions";

import { formatLongDate } from "./date-utils";
import {
  budgetTotals,
  formatAmount,
  groupBudgetLines,
  linePlanned,
  lineVariance,
} from "./budget";

const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#1f2937",
    lineHeight: 1.65,
  },
  runningHeader: {
    position: "absolute",
    top: 24,
    left: 44,
    right: 44,
    fontSize: 9,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1 solid #e5e7eb",
    paddingBottom: 6,
  },
  runningFooter: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 9,
    color: "#9ca3af",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1 solid #e5e7eb",
    paddingTop: 6,
  },
  header: { marginBottom: 28, borderBottom: "2 solid #2563eb", paddingBottom: 14 },
  date: { fontSize: 10, color: "#6b7280", marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 6, lineHeight: 1.3 },
  author: { fontSize: 10, color: "#6b7280" },
  section: { marginBottom: 16 },
  h2: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 6,
    marginBottom: 12,
    color: "#111827",
  },
  para: { marginBottom: 12, textAlign: "justify" },
  bullet: { flexDirection: "row", marginBottom: 10 },
  bulletDot: { width: 12 },
  bulletText: { flex: 1 },
  imageRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  imageBox: { width: "23.5%", marginRight: "2%", marginBottom: 10 },
  image: { width: "100%", height: 115, objectFit: "cover", backgroundColor: "#f3f4f6", borderRadius: 6 },
  imageCaption: { fontSize: 9, color: "#4b5563", marginTop: 3, textAlign: "center" },
});

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function Paragraphs({ text }: { text: string }) {
  const paras = splitParagraphs(text);
  if (paras.length === 0) return null;
  return (
    <>
      {paras.map((p, i) => (
        <Text key={i} style={styles.para}>
          {p}
        </Text>
      ))}
    </>
  );
}

type PdfImg = { id: string; url: string; caption?: string | null };

/** Same layout as the web page: rows of 4 square photos, captions under each.
 *  A row never splits across two pages, so photos keep their order and position. */
function ImageGrid({ images }: { images: PdfImg[] }) {
  const list = images.filter((i) => i.url);
  const rows: PdfImg[][] = [];
  for (let i = 0; i < list.length; i += 4) rows.push(list.slice(i, i + 4));
  return (
    <View style={{ marginTop: 12 }}>
      {rows.map((row, r) => (
        <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: 10 }}>
          {row.map((img, i) => (
            <View key={img.id} style={[styles.imageBox, { marginBottom: 0 }, i === 3 ? { marginRight: 0 } : {}]}>
              <Image src={img.url} style={styles.image} />
              {img.caption ? <Text style={styles.imageCaption}>{img.caption}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function AttachmentList({ items }: { items: { id: string; file_name: string }[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      {items.map((a) => (
        <View style={styles.bullet} key={a.id} wrap={false}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{a.file_name}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportPdfDocument({
  report,
  approvals,
}: {
  report: LoadedReport;
  approvals?: ApprovalEntry[];
}) {

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View
          fixed
          style={styles.runningHeader}
          render={({ pageNumber }) =>
            pageNumber > 1 ? <Text>{report.title}</Text> : null
          }
        />
        <View fixed style={styles.runningFooter}>
          <Text>Par {report.author_name}</Text>
          {(report as any).__parts ? null : (
            <Text
              render={({ pageNumber, totalPages }) =>
                `${pageNumber} / ${totalPages}`
              }
            />
          )}
        </View>
        {(report as any).__continuation ? null : (
        <View style={styles.header}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Image src={REPORT_LOGO_URL()} style={{ width: 70, height: 60, objectFit: "contain" }} />
            <Text style={styles.date}>{formatLongDate(report.report_date)}</Text>
          </View>
          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.author}>Par {report.author_name}</Text>
        </View>
        )}


        {report.intro && (
          <View style={styles.section}>
                        <Paragraphs text={report.intro} />
          </View>
        )}

        {report.sections.map((s) => {
          const paras = s.description ? splitParagraphs(s.description) : [];
          const rest = s.title ? paras.slice(1) : paras;
          const list = s.images.filter((i) => i.url);
          const rows: PdfImg[][] = [];
          for (let i = 0; i < list.length; i += 4) rows.push(list.slice(i, i + 4));
          return [
            s.title ? (
              <View key={`${s.id}-h`} style={{ marginTop: 10 }}>
                {/* Never wrap={false} here: a long first paragraph taller than a page breaks the layout engine. */}
                <Text style={styles.h2} minPresenceAhead={60}>{s.title}</Text>
                {paras[0] ? <Text style={styles.para}>{paras[0]}</Text> : null}
              </View>
            ) : null,
            ...rest.map((p, i) => (
              <Text key={`${s.id}-p${i}`} style={styles.para}>{p}</Text>
            )),
            ...s.bullets.map((b) => (
              <View style={styles.bullet} key={b.id} wrap={false}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{b.content}</Text>
              </View>
            )),
            ...rows.map((row, r) => (
              <View key={`${s.id}-r${r}`} wrap={false} style={{ flexDirection: "row", marginTop: r === 0 ? 8 : 0, marginBottom: 10 }}>
                {row.map((img, i) => (
                  <View key={img.id} style={[styles.imageBox, { marginBottom: 0 }, i === 3 ? { marginRight: 0 } : {}]}>
                    <Image src={img.url} style={styles.image} />
                    {img.caption ? <Text style={styles.imageCaption}>{img.caption}</Text> : null}
                  </View>
                ))}
              </View>
            )),
            s.attachments && s.attachments.length > 0 ? (
              <AttachmentList key={`${s.id}-a`} items={s.attachments} />
            ) : null,
            <View key={`${s.id}-end`} style={{ height: 8 }} />,
          ];
        })}

        {report.conclusion && (
          <View style={styles.section}>
            <Paragraphs text={report.conclusion} />
          </View>
        )}

        {report.general_images.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2} minPresenceAhead={130}>Images</Text>
            <ImageGrid images={report.general_images} />
          </View>
        )}
        {report.general_attachments && report.general_attachments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2} minPresenceAhead={30}>Pièces jointes</Text>
            <AttachmentList items={report.general_attachments} />
          </View>
        )}
        {report.signature && (
          <View wrap={false} style={{ marginTop: 24, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end" }}>
            <View style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 8, color: "#6b7280" }}>LU ET APPROUVÉ</Text>
              <Text style={{ fontSize: 10, fontWeight: 700 }}>{report.signature.signer_name}</Text>
              {report.signature.signer_role ? <Text style={{ fontSize: 9, color: "#6b7280" }}>{report.signature.signer_role}</Text> : null}
              <Text style={{ fontSize: 8, color: "#6b7280" }}>
                Le {new Date(report.signature.signed_at).toLocaleDateString("fr-FR")} à {new Date(report.signature.signed_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            {report.signature.signature_image ? (
              <Image src={report.signature.signature_image} style={{ width: 120, height: 60, objectFit: "contain" }} />
            ) : null}
            {report.signature.stamp_image ? (
              <Image src={report.signature.stamp_image} style={{ width: 70, height: 70, objectFit: "contain", marginLeft: 8 }} />
            ) : null}
          </View>
        )}
      </Page>

    </Document>
  );
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Redraw via canvas: the browser applies EXIF orientation, so phone
    // photos come out upright, and output is a clean JPEG for the PDF.
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close?.();
        return canvas.toDataURL("image/jpeg", 0.88);
      }
    } catch {
      /* fall back to raw data */
    }
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function inlineReportImages(report: LoadedReport): Promise<LoadedReport> {
  const all = [
    ...report.sections.flatMap((s) => s.images),
    ...report.general_images,
  ];
  const uniqueUrls = Array.from(new Set(all.map((i) => i.url).filter(Boolean)));
  const map = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (u) => {
      const d = await urlToDataUrl(u);
      if (d) map.set(u, d);
    }),
  );
  const rewrite = (u: string) => (u && map.get(u)) || "";
  return {
    ...report,
    sections: report.sections.map((s) => ({
      ...s,
      images: s.images.map((i) => ({ ...i, url: rewrite(i.url) })),
    })),
    general_images: report.general_images.map((i) => ({
      ...i,
      url: rewrite(i.url),
    })),
  };
}

export async function generateReportPdfBlob(
  report: LoadedReport,
  approvals?: ApprovalEntry[],
): Promise<Blob> {
  if (report.doc_type === "budget") {
    return await pdf(<BudgetPdfDocument report={report} />).toBlob();
  }
  const prepared = await inlineReportImages(report);
  try {
    return await pdf(<ReportPdfDocument report={prepared} approvals={approvals} />).toBlob();
  } catch (e) {
    // Very long reports can trip a page-layout bug in the PDF engine.
    // Fallback: render the report in smaller parts and join them into one file.
    if (prepared.sections.length < 2) throw e;
    return await generateInParts(prepared, approvals);
  }
}

async function generateInParts(report: LoadedReport, approvals?: ApprovalEntry[]): Promise<Blob> {
  const parts: LoadedReport[] = [];
  const sizes = [6, 4, 2, 1];
  const renderPart = async (r: LoadedReport) =>
    new Uint8Array(await (await pdf(<ReportPdfDocument report={r} approvals={approvals} />).toBlob()).arrayBuffer());
  const out = await PDFDocument.create();
  const n = report.sections.length;
  let i = 0;
  while (i < n) {
    let done = false;
    for (const size of sizes) {
      const end = Math.min(n, i + size);
      const part: LoadedReport = {
        ...report,
        intro: i === 0 ? report.intro : "",
        sections: report.sections.slice(i, end),
        conclusion: end === n ? report.conclusion : "",
        general_images: end === n ? report.general_images : [],
        general_attachments: end === n ? report.general_attachments : [],
        signature: end === n ? report.signature : null,
        __continuation: i > 0,
        __parts: true,
      } as any;
      try {
        const bytes = await renderPart(part);
        const doc = await PDFDocument.load(bytes);
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        parts.push(part);
        i = end;
        done = true;
        break;
      } catch (err) {
        if (size === 1) throw err;
      }
    }
    if (!done) break;
  }
  // Page numbers across the whole merged file, matching the normal footer position.
  const font = await out.embedFont(StandardFonts.Helvetica);
  const all = out.getPages();
  all.forEach((page, idx) => {
    const label = `${idx + 1} / ${all.length}`;
    const { width } = page.getSize();
    page.drawText(label, { x: width - 44 - font.widthOfTextAtSize(label, 9), y: 24 + 4, size: 9, font, color: rgb(0.61, 0.64, 0.69) });
  });
  return new Blob([(await out.save()) as BlobPart], { type: "application/pdf" });
}

export async function downloadReportPdf(
  report: LoadedReport,
  approvals?: ApprovalEntry[],
) {
  const blob = await generateReportPdfBlob(report, approvals);
  const prefix = report.doc_type === "budget" ? report.doc_number || "budget" : report.title;
  const filename = `${sanitize(prefix)}-${report.report_date}.pdf`;
  triggerDownload(blob, filename);
}



export async function downloadReportsBundle(reports: LoadedReport[]) {
  if (reports.length === 0) return;
  if (reports.length === 1) {
    await downloadReportPdf(reports[0]);
    return;
  }
  const merged = await PDFDocument.create();
  for (const r of reports) {
    const blob = await generateReportPdfBlob(r);
    const bytes = await blob.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const bytes = await merged.save();
  triggerDownload(new Blob([bytes.slice().buffer], { type: "application/pdf" }), "rapports.pdf");
}

function sanitize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "rapport";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareReportPdf(report: LoadedReport) {
  const blob = await generateReportPdfBlob(report);
  const file = new File([blob], `${sanitize(report.title)}.pdf`, {
    type: "application/pdf",
  });
  const nav = navigator as any;
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: report.title,
        text: `${report.title} — ${formatLongDate(report.report_date)}`,
      });
      return "shared";
    } catch {
      // user cancelled or unsupported
    }
  }
  triggerDownload(blob, `${sanitize(report.title)}.pdf`);
  return "downloaded";
}

// ============== Procès-verbal (PV) ==============

const pvStyles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#1f2937",
    lineHeight: 1.6,
  },
  banner: {
    borderTop: "2 solid #111827",
    borderBottom: "2 solid #111827",
    paddingVertical: 10,
    marginBottom: 20,
    textAlign: "center",
  },
  bannerText: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 2,
    color: "#111827",
  },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 90, color: "#6b7280", fontSize: 10 },
  metaValue: { flex: 1, fontSize: 11 },
  h2: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 18,
    marginBottom: 8,
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  para: { textAlign: "justify", marginBottom: 8 },
  attendeeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1 solid #e5e7eb",
    paddingVertical: 4,
    fontSize: 11,
  },
  signBlock: {
    marginTop: 40,
    alignSelf: "flex-end",
    width: 220,
  },
  signLabel: { fontSize: 9, color: "#6b7280", textTransform: "uppercase" },
  signName: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  signRole: { fontSize: 10, color: "#6b7280" },
  signBox: {
    marginTop: 8,
    height: 60,
    border: "1 solid #d1d5db",
    borderRadius: 3,
  },
});

function formatPvDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

function MinutePDFDocument({
  minute,
  reportTitle,
}: {
  minute: ReportMinute;
  reportTitle: string;
}) {
  return (
    <Document>
      <Page size="A4" style={pvStyles.page}>
        <View style={pvStyles.banner}>
          <Text style={pvStyles.bannerText}>
            PROCÈS-VERBAL N° {minute.number}
          </Text>
        </View>

        <View style={pvStyles.metaRow}>
          <Text style={pvStyles.metaLabel}>Rapport</Text>
          <Text style={pvStyles.metaValue}>{reportTitle}</Text>
        </View>
        <View style={pvStyles.metaRow}>
          <Text style={pvStyles.metaLabel}>Date</Text>
          <Text style={pvStyles.metaValue}>{formatPvDate(minute.held_at)}</Text>
        </View>
        <View style={pvStyles.metaRow}>
          <Text style={pvStyles.metaLabel}>Lieu</Text>
          <Text style={pvStyles.metaValue}>{minute.location || "—"}</Text>
        </View>
        <View style={pvStyles.metaRow}>
          <Text style={pvStyles.metaLabel}>Objet</Text>
          <Text style={pvStyles.metaValue}>{minute.subject || "—"}</Text>
        </View>

        {minute.attendees.length > 0 && (
          <>
            <Text style={pvStyles.h2}>Personnes présentes</Text>
            <View>
              {minute.attendees.map((a, i) => (
                <View key={i} style={pvStyles.attendeeRow}>
                  <Text>{a.name || "—"}</Text>
                  <Text style={{ color: "#6b7280" }}>{a.role}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {minute.facts && (
          <>
            <Text style={pvStyles.h2}>Faits constatés</Text>
            <Paragraphs text={minute.facts} />
          </>
        )}

        {minute.decisions && (
          <>
            <Text style={pvStyles.h2}>Décisions / mesures prises</Text>
            <Paragraphs text={minute.decisions} />
          </>
        )}

        <View style={pvStyles.signBlock}>
          <Text style={pvStyles.signLabel}>Rédacteur</Text>
          <Text style={pvStyles.signName}>{minute.signer_name || "—"}</Text>
          <Text style={pvStyles.signRole}>{minute.signer_role}</Text>
          <View style={pvStyles.signBox} />
        </View>
      </Page>
    </Document>
  );
}

export async function generateMinutePdfBlob(
  minute: ReportMinute,
  reportTitle: string,
): Promise<Blob> {
  return await pdf(
    <MinutePDFDocument minute={minute} reportTitle={reportTitle} />,
  ).toBlob();
}

export async function downloadMinutePdf(
  minute: ReportMinute,
  reportTitle: string,
) {
  const blob = await generateMinutePdfBlob(minute, reportTitle);
  triggerDownload(blob, `${sanitize(minute.number || "pv")}.pdf`);
}

// ============== Fiche de budget ==============

const bStyles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 50,
    paddingHorizontal: 34,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1f2937",
    lineHeight: 1.4,
  },
  header: { marginBottom: 14, borderBottom: "2 solid #111827", paddingBottom: 10 },
  docKind: { fontSize: 9, color: "#6b7280", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: 700, color: "#111827", marginTop: 3 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  metaCell: { width: "50%", flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 74, color: "#6b7280" },
  metaValue: { flex: 1 },
  h2: { fontSize: 10, fontWeight: 700, marginTop: 12, marginBottom: 5, color: "#111827" },
  note: { textAlign: "justify", marginBottom: 5 },
  row: { flexDirection: "row", borderBottom: "0.5 solid #e5e7eb", minHeight: 18 },
  headRow: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: "1 solid #9ca3af" },
  catRow: { flexDirection: "row", backgroundColor: "#eef2ff" },
  totalRow: { flexDirection: "row", borderTop: "1 solid #111827", backgroundColor: "#f9fafb" },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  cLabel: { width: "26%" },
  cUnit: { width: "8%" },
  cQty: { width: "7%", textAlign: "right" },
  cPu: { width: "12%", textAlign: "right" },
  cPlan: { width: "13%", textAlign: "right" },
  cReal: { width: "12%", textAlign: "right" },
  cVar: { width: "12%", textAlign: "right" },
  cNotes: { width: "10%" },
  bold: { fontWeight: 700 },
});

function BudgetPdfDocument({ report }: { report: LoadedReport }) {
  const lines = report.budget_lines ?? [];
  const currency = report.currency ?? "XOF";
  const taxRate = report.tax_rate ?? 0;
  const groups = groupBudgetLines(lines);
  const totals = budgetTotals(lines, taxRate);
  const fmt = (n: number) => formatAmount(n, currency);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={bStyles.page}>
        <View fixed style={styles.runningFooter}>
          <Text>{report.doc_number || "Budget"}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

        <View style={bStyles.header}>
          <Text style={bStyles.docKind}>FICHE DE BUDGET</Text>
          <Text style={bStyles.title}>{report.title}</Text>
          <View style={bStyles.metaGrid}>
            <View style={bStyles.metaCell}>
              <Text style={bStyles.metaLabel}>Numéro</Text>
              <Text style={bStyles.metaValue}>{report.doc_number || "—"}</Text>
            </View>
            <View style={bStyles.metaCell}>
              <Text style={bStyles.metaLabel}>Date</Text>
              <Text style={bStyles.metaValue}>{formatLongDate(report.report_date)}</Text>
            </View>
            <View style={bStyles.metaCell}>
              <Text style={bStyles.metaLabel}>Période</Text>
              <Text style={bStyles.metaValue}>{report.period_label || "—"}</Text>
            </View>
            <View style={bStyles.metaCell}>
              <Text style={bStyles.metaLabel}>Entité</Text>
              <Text style={bStyles.metaValue}>{report.counterparty || "—"}</Text>
            </View>
            <View style={bStyles.metaCell}>
              <Text style={bStyles.metaLabel}>Devise</Text>
              <Text style={bStyles.metaValue}>{currency}</Text>
            </View>
            <View style={bStyles.metaCell}>
              <Text style={bStyles.metaLabel}>Auteur</Text>
              <Text style={bStyles.metaValue}>{report.author_name}</Text>
            </View>
          </View>
        </View>

        {report.intro ? (
          <>
            <Text style={bStyles.h2}>Contexte / hypothèses</Text>
            <Text style={bStyles.note}>{report.intro}</Text>
          </>
        ) : null}

        <View style={bStyles.headRow}>
          <Text style={[bStyles.cell, bStyles.cLabel, bStyles.bold]}>Rubrique</Text>
          <Text style={[bStyles.cell, bStyles.cUnit, bStyles.bold]}>Unité</Text>
          <Text style={[bStyles.cell, bStyles.cQty, bStyles.bold]}>Qté</Text>
          <Text style={[bStyles.cell, bStyles.cPu, bStyles.bold]}>P.U.</Text>
          <Text style={[bStyles.cell, bStyles.cPlan, bStyles.bold]}>Prévu</Text>
          <Text style={[bStyles.cell, bStyles.cReal, bStyles.bold]}>Réalisé</Text>
          <Text style={[bStyles.cell, bStyles.cVar, bStyles.bold]}>Écart</Text>
          <Text style={[bStyles.cell, bStyles.cNotes, bStyles.bold]}>Obs.</Text>
        </View>

        {groups.map((g) => (
          <View key={g.category} wrap={false}>
            <View style={bStyles.catRow}>
              <Text style={[bStyles.cell, bStyles.bold, { width: "100%" }]}>{g.category}</Text>
            </View>
            {g.lines.map((l, i) => (
              <View key={l.id ?? `${g.category}-${i}`} style={bStyles.row}>
                <Text style={[bStyles.cell, bStyles.cLabel]}>{l.label || "—"}</Text>
                <Text style={[bStyles.cell, bStyles.cUnit]}>{l.unit || "—"}</Text>
                <Text style={[bStyles.cell, bStyles.cQty]}>{l.quantity || "—"}</Text>
                <Text style={[bStyles.cell, bStyles.cPu]}>{fmt(l.unit_price)}</Text>
                <Text style={[bStyles.cell, bStyles.cPlan]}>{fmt(linePlanned(l))}</Text>
                <Text style={[bStyles.cell, bStyles.cReal]}>{fmt(l.actual_amount)}</Text>
                <Text style={[bStyles.cell, bStyles.cVar]}>{fmt(lineVariance(l))}</Text>
                <Text style={[bStyles.cell, bStyles.cNotes]}>{l.notes || ""}</Text>
              </View>
            ))}
            <View style={bStyles.row}>
              <Text style={[bStyles.cell, { width: "53%", textAlign: "right", color: "#6b7280" }]}>
                {`Sous-total ${g.category}`}
              </Text>
              <Text style={[bStyles.cell, bStyles.cPlan, bStyles.bold]}>{fmt(g.planned)}</Text>
              <Text style={[bStyles.cell, bStyles.cReal, bStyles.bold]}>{fmt(g.actual)}</Text>
              <Text style={[bStyles.cell, bStyles.cVar, bStyles.bold]}>{fmt(g.variance)}</Text>
              <Text style={[bStyles.cell, bStyles.cNotes]} />
            </View>
          </View>
        ))}

        <View style={bStyles.totalRow}>
          <Text style={[bStyles.cell, { width: "53%", textAlign: "right" }, bStyles.bold]}>
            Total prévu
          </Text>
          <Text style={[bStyles.cell, bStyles.cPlan, bStyles.bold]}>{fmt(totals.planned)}</Text>
          <Text style={[bStyles.cell, bStyles.cReal, bStyles.bold]}>{fmt(totals.actual)}</Text>
          <Text style={[bStyles.cell, bStyles.cVar, bStyles.bold]}>{fmt(totals.variance)}</Text>
          <Text style={[bStyles.cell, bStyles.cNotes]} />
        </View>

        {taxRate > 0 ? (
          <>
            <View style={bStyles.row}>
              <Text style={[bStyles.cell, { width: "53%", textAlign: "right", color: "#6b7280" }]}>
                {`TVA ${taxRate}%`}
              </Text>
              <Text style={[bStyles.cell, bStyles.cPlan]}>{fmt(totals.taxAmount)}</Text>
              <Text style={[bStyles.cell, { width: "34%" }]} />
            </View>
            <View style={bStyles.totalRow}>
              <Text style={[bStyles.cell, { width: "53%", textAlign: "right" }, bStyles.bold]}>
                Total TTC
              </Text>
              <Text style={[bStyles.cell, bStyles.cPlan, bStyles.bold]}>{fmt(totals.totalWithTax)}</Text>
              <Text style={[bStyles.cell, { width: "34%" }]} />
            </View>
          </>
        ) : null}

        {report.conclusion ? (
          <>
            <Text style={bStyles.h2}>Commentaires / recommandations</Text>
            <Text style={bStyles.note}>{report.conclusion}</Text>
          </>
        ) : null}
      </Page>
    </Document>
  );
}
