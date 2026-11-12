import { createFileRoute, Link } from "@tanstack/react-router";
import { BudgetView } from "@/components/budget/BudgetView";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSharedReport, logSharedExport } from "@/lib/reports.functions";
import { appAssetUrl } from "@/lib/app-url";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Loader2, Clock, FileText } from "lucide-react";
import { formatLongDate } from "@/lib/date-utils";
import { Lightbox } from "@/components/Lightbox";
import { AttachmentsView } from "@/components/AttachmentUploader";
import { useMemo, useState } from "react";
import { downloadReportPdf } from "@/lib/pdf-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/share/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rapport partagé — DailyBrief" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Consultation en lecture seule d'un rapport partagé via DailyBrief.",
      },
      { property: "og:title", content: "Rapport partagé — DailyBrief" },
      {
        property: "og:description",
        content: "Consultation en lecture seule d'un rapport partagé via DailyBrief.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:image",
        content: appAssetUrl("/og-dailybrief.jpg"),
      },
      {
        name: "twitter:image",
        content: appAssetUrl("/og-dailybrief.jpg"),
      },
    ],
  }),
  component: SharedReportPage,
});

function RichText({ text }: { text: string }) {
  const paras = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return null;
  return (
    <div className="space-y-5 text-foreground/90 leading-relaxed">
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}

function slugify(str: string, fallback: string): string {
  const s = (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || fallback;
}

function SharedReportPage() {
  const { token } = Route.useParams();
  const fetchShared = useServerFn(getSharedReport);
  const logExport = useServerFn(logSharedExport);

  const query = useQuery({
    queryKey: ["shared-report", token],
    queryFn: () => fetchShared({ data: { token } }),
    retry: false,
  });
  const [lightbox, setLightbox] = useState<{
    images: { url: string; id: string }[];
    index: number;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const sectionAnchors = useMemo(() => {
    const d = query.data;
    if (!d) return [] as { id: string; label: string; anchor: string }[];
    return d.sections.map((s, i) => ({
      id: s.id,
      label: s.title || "",
      anchor: `sec-${slugify(s.title, String(i + 1))}-${i}`,
    }));
  }, [query.data]);

  async function handleDownload() {
    if (!query.data) return;
    setDownloading(true);
    try {
      await downloadReportPdf(query.data);
      logExport({ data: { token } }).catch(() => {});
    } catch (e: any) {
      toast.error(e?.message ?? "Téléchargement impossible");
    } finally {
      setDownloading(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    const msg = (query.error as any)?.message ?? "";
    const expired = /expir/i.test(msg);
    return (
      <div className="min-h-dvh grid place-items-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-3">
            <h1 className="text-xl font-semibold">
              {expired ? "Lien expiré" : "Lien invalide"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {expired
                ? "Ce lien de partage a expiré. Contactez l'auteur du rapport pour en obtenir un nouveau."
                : "Ce lien de partage n'existe plus ou a été révoqué."}
            </p>
            <Button asChild variant="outline">
              <Link to="/">Accueil</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const r = query.data;
  const expiresAt = r.share_expires_at ?? null;
  const hasContent =
    !!r.intro ||
    !!r.conclusion ||
    r.sections.length > 0 ||
    r.general_images.length > 0;

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Rapport partagé · lecture seule
            </div>
            <div className="text-sm font-medium truncate">{r.title}</div>
          </div>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Télécharger PDF
          </Button>
        </div>
      </header>

      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 flex-1 grid gap-8 lg:grid-cols-[220px_1fr]">
        {sectionAnchors.some((a) => a.label) && (
          <aside className="hidden lg:block">
            <nav
              aria-label="Table des matières"
              className="sticky top-24 space-y-1 text-sm"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Sommaire
              </div>
              {sectionAnchors.filter((a) => a.label).map((a) => (
                <a
                  key={a.id}
                  href={`#${a.anchor}`}
                  className="block px-2 py-1 rounded hover:bg-muted focus:bg-muted outline-none truncate"
                >
                  {a.label}
                </a>
              ))}
              {r.general_images.length > 0 && (
                <a
                  href="#images"
                  className="block px-2 py-1 rounded hover:bg-muted focus:bg-muted outline-none"
                >
                  Images
                </a>
              )}
            </nav>
          </aside>
        )}

        <main className="min-w-0 space-y-10 scroll-smooth">
          <div className="border-b border-border pb-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <img src="/logo-mbc.png" alt="Logo MBC" className="h-14 w-auto" />
              <div className="text-sm text-primary font-medium">
                {formatLongDate(r.report_date)}
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-1">
              {r.title}
            </h1>
            <div className="text-sm text-muted-foreground mt-2">
              Par{" "}
              <span className="font-medium text-foreground">
                {r.author_name}
              </span>
            </div>
            {expiresAt && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Expire le {formatLongDate(expiresAt.slice(0, 10))}
              </div>
            )}
          </div>

          {!hasContent && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-60" />
                Ce rapport ne contient pas encore de contenu.
              </CardContent>
            </Card>
          )}

          {r.doc_type === "budget" && <BudgetView report={r} />}

          {r.doc_type !== "budget" && r.intro && (
            <section id="intro" className="scroll-mt-24">
              <RichText text={r.intro} />
            </section>
          )}

          {r.sections.map((s, i) => {
            const anchor = sectionAnchors[i]?.anchor ?? `sec-${i}`;
            return (
              <section
                key={s.id}
                id={anchor}
                className="space-y-4 scroll-mt-24"
              >
                {s.title && <h2 className="text-xl font-semibold">{s.title}</h2>}
                {s.description && <RichText text={s.description} />}
                {s.bullets.length > 0 && (
                  <ul className="list-disc pl-6 space-y-3">
                    {s.bullets.map((b) => (
                      <li key={b.id} className="leading-relaxed">
                        {b.content}
                      </li>
                    ))}
                  </ul>
                )}
                {s.images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {s.images.map((img, idx) => (
                      <figure key={img.id} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({
                              images: s.images.map((i2) => ({
                                id: i2.id,
                                url: i2.url,
                              })),
                              index: idx,
                            })
                          }
                          className="block w-full aspect-square rounded-md overflow-hidden bg-muted border border-border focus:ring-2 focus:ring-primary outline-none"
                        >
                          <img
                            src={img.url}
                            alt={img.caption || ""}
                            className="w-full h-full object-cover hover:scale-105 transition-transform"
                          />
                        </button>
                        {img.caption && (
                          <figcaption className="text-xs text-muted-foreground text-center leading-snug">
                            {img.caption}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
                {s.attachments && s.attachments.length > 0 && (
                  <AttachmentsView attachments={s.attachments} title="" />
                )}
              </section>
            );
          })}

          {r.doc_type !== "budget" && r.conclusion && (
            <section id="conclusion" className="scroll-mt-24">
              <RichText text={r.conclusion} />
            </section>
          )}

          {r.general_images.length > 0 && (
            <section id="images" className="scroll-mt-24">
              <h2 className="text-xl font-semibold mb-2">Images</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {r.general_images.map((img, idx) => (
                  <figure key={img.id} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          images: r.general_images.map((i) => ({
                            id: i.id,
                            url: i.url,
                          })),
                          index: idx,
                        })
                      }
                      className="block w-full aspect-square rounded-md overflow-hidden bg-muted border border-border focus:ring-2 focus:ring-primary outline-none"
                    >
                      <img
                        src={img.url}
                        alt={img.caption || ""}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </button>
                    {img.caption && (
                      <figcaption className="text-xs text-muted-foreground text-center leading-snug">
                        {img.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {r.general_attachments && r.general_attachments.length > 0 && (
            <section id="attachments" className="scroll-mt-24">
              <AttachmentsView attachments={r.general_attachments} />
            </section>
          )}


          {lightbox && (
            <Lightbox
              images={lightbox.images}
              index={lightbox.index}
              onClose={() => setLightbox(null)}
              onChange={(i) => setLightbox({ ...lightbox, index: i })}
            />
          )}
        </main>
      </div>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Rapport partagé en lecture seule · Généré via DailyBrief
      </footer>
    </div>
  );
}
