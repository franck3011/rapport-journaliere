import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  ArrowLeft,
  CornerUpLeft,
  Download,
  Forward,
  Inbox,
  Loader2,
  MailOpen,
  Paperclip,
  Pen,
  RefreshCw,
  Search,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  deleteMailMessage,
  downloadMailAttachment,
  flagMailMessage,
  getMailMessage,
  listMailMessages,
  mailStatus,
  moveMailMessage,
  syncMailAccounts,
} from "@/lib/mail/mail.functions";
import {
  FOLDER_LABELS,
  FOLDER_ORDER,
  PROVIDER_LABELS,
  addressLabel,
  formatBytes,
  type MailFolderKind,
} from "@/lib/mail/types";
import { ComposeMailDialog, type ComposeSeed } from "@/components/mail/ComposeMailDialog";

export const Route = createFileRoute("/_authenticated/mail/inbox")({
  head: () => ({
    meta: [
      { title: "Messagerie — DailyBrief" },
      {
        name: "description",
        content:
          "Lisez, répondez, classez et recherchez tous vos e-mails multi-comptes depuis une boîte unifiée.",
      },
      { property: "og:title", content: "Messagerie — DailyBrief" },
      {
        property: "og:description",
        content: "Une seule boîte pour Gmail, Outlook, Yahoo et vos comptes professionnels.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnifiedInbox,
});

/** Heure si c'est aujourd'hui, date courte sinon. */
function messageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function initialsFrom(value: string): string {
  const label = value.replace(/<.*?>/, "").trim();
  const parts = label.split(/[\s.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function IconBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span className={danger ? "text-destructive" : undefined}>{children}</span>
    </Button>
  );
}

function UnifiedInbox() {
  const qc = useQueryClient();
  const statusFn = useServerFn(mailStatus);
  const listFn = useServerFn(listMailMessages);
  const getFn = useServerFn(getMailMessage);
  const flagFn = useServerFn(flagMailMessage);
  const moveFn = useServerFn(moveMailMessage);
  const delFn = useServerFn(deleteMailMessage);
  const attFn = useServerFn(downloadMailAttachment);
  const syncFn = useServerFn(syncMailAccounts);

  const [accountId, setAccountId] = useState<string | null>(null);
  const [folder, setFolder] = useState<MailFolderKind>("inbox");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [withAttachments, setWithAttachments] = useState(false);
  const [selected, setSelected] = useState<{ accountId: string; messageId: string } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [seed, setSeed] = useState<ComposeSeed | undefined>();

  const { data: status } = useQuery({ queryKey: ["mail", "status"], queryFn: () => statusFn() });
  const accounts = status?.accounts ?? [];

  const filters = useMemo(
    () => ({
      accountId,
      folder,
      search: applied || undefined,
      unreadOnly,
      withAttachments,
    }),
    [accountId, folder, applied, unreadOnly, withAttachments],
  );

  const {
    data: listing,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["mail", "messages", filters],
    queryFn: () => listFn({ data: filters }),
    enabled: accounts.length > 0,
  });

  const { data: message, isLoading: loadingMessage } = useQuery({
    queryKey: ["mail", "message", selected?.accountId, selected?.messageId],
    queryFn: () => getFn({ data: selected! }),
    enabled: !!selected,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["mail"] });

  const flag = useMutation({
    mutationFn: (v: { messageId: string; accountId: string; read?: boolean; starred?: boolean }) =>
      flagFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: (v: { messageId: string; accountId: string; folder: MailFolderKind }) =>
      moveFn({ data: v }),
    onSuccess: () => {
      toast.success("Message déplacé.");
      setSelected(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (v: { messageId: string; accountId: string }) => delFn({ data: v }),
    onSuccess: () => {
      toast.success("Message supprimé.");
      setSelected(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { accountId } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(attachmentId: string, filename: string) {
    if (!selected) return;
    try {
      const res = await attFn({ data: { accountId: selected.accountId, attachmentId } });
      const link = document.createElement("a");
      link.href = `data:${res.mimeType};base64,${res.base64}`;
      link.download = filename;
      link.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible.");
    }
  }

  const messages = listing?.messages ?? [];

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/60">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mt-6 text-xl font-semibold">Aucun compte e-mail connecté</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Ajoutez un compte Gmail ou Outlook dans les paramètres de la messagerie pour retrouver
          tous vos messages ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Barre supérieure */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Messagerie</h1>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
              onBlur={() => setApplied(search.trim())}
              placeholder="Rechercher"
              className="h-10 w-full rounded-full border-0 bg-muted/60 pl-10 shadow-none focus-visible:ring-1"
              aria-label="Rechercher dans les e-mails"
            />
          </div>
          <IconBtn label="Relever le courrier" onClick={() => sync.mutate()}>
            {sync.isPending ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <RefreshCw className="h-[18px] w-[18px]" />
            )}
          </IconBtn>
        </div>
      </div>

      {(listing?.errors?.length ?? 0) > 0 && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            {Array.from(new Set(listing!.errors)).join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      {/* Filtres mobiles */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Select
          value={folder}
          onValueChange={(v) => {
            setFolder(v as MailFolderKind);
            setSelected(null);
          }}
        >
          <SelectTrigger className="h-9 w-[140px] rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLDER_ORDER.map((f) => (
              <SelectItem key={f} value={f}>
                {FOLDER_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={accountId ?? "all"}
          onValueChange={(v) => setAccountId(v === "all" ? null : v)}
        >
          <SelectTrigger className="h-9 min-w-0 flex-1 rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les comptes</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={unreadOnly ? "default" : "outline"}
          className="h-9 rounded-full"
          onClick={() => setUnreadOnly((v) => !v)}
        >
          Non lus
        </Button>
      </div>

      {/* Coque */}
      <div className="flex min-h-[600px] overflow-hidden rounded-2xl bg-background ring-1 ring-border/50 lg:h-[calc(100dvh-10rem)]">
        {/* Rail */}
        <aside className="hidden w-[224px] shrink-0 flex-col border-r border-border/40 bg-muted/30 lg:flex">
          <div className="px-4 pb-2 pt-5">
            <Button
              className="h-10 w-full justify-start rounded-full"
              onClick={() => {
                setSeed(undefined);
                setComposeOpen(true);
              }}
            >
              <Pen className="mr-2 h-4 w-4" />
              Nouveau message
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Dossiers
            </p>
            <div className="space-y-0.5">
              {FOLDER_ORDER.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFolder(f);
                    setSelected(null);
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-[7px] text-left text-[14px] transition ${
                    folder === f
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground/80 hover:bg-background/70"
                  }`}
                >
                  {FOLDER_LABELS[f]}
                </button>
              ))}
            </div>

            <p className="px-2 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Comptes
            </p>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => setAccountId(null)}
                className={`flex w-full items-center rounded-lg px-3 py-[7px] text-left text-[14px] transition ${
                  accountId === null
                    ? "bg-background font-medium shadow-sm"
                    : "text-foreground/80 hover:bg-background/70"
                }`}
              >
                Tous les comptes
              </button>
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  className={`flex w-full flex-col rounded-lg px-3 py-[7px] text-left transition ${
                    accountId === a.id ? "bg-background shadow-sm" : "hover:bg-background/70"
                  }`}
                >
                  <span className="truncate text-[14px]">{a.email}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {PROVIDER_LABELS[a.provider]}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <div className="space-y-3 border-t border-border/40 px-5 py-4 text-[13px]">
            <label className="flex cursor-pointer items-center gap-2.5 text-foreground/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Non lus
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-foreground/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={withAttachments}
                onChange={(e) => setWithAttachments(e.target.checked)}
              />
              Avec pièce jointe
            </label>
          </div>
        </aside>

        {/* Liste */}
        <section
          className={`flex min-w-0 flex-col border-r border-border/40 ${
            selected ? "hidden lg:flex" : "flex"
          } lg:w-[400px] lg:shrink-0`}
        >
          <header className="flex items-center gap-2 px-6 pb-3 pt-5">
            <h2 className="text-[15px] font-semibold">{FOLDER_LABELS[folder]}</h2>
            <span className="text-[13px] text-muted-foreground">{messages.length}</span>
            {(isFetching || isLoading) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            {!isLoading && messages.length === 0 && (
              <div className="px-8 py-20 text-center">
                <p className="text-[15px] font-medium">Aucun message</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Rien dans « {FOLDER_LABELS[folder]}
                  {applied ? ` » pour « ${applied} »` : " »"}.
                </p>
              </div>
            )}

            {messages.map((m) => {
              const active = selected?.messageId === m.id;
              return (
                <button
                  key={`${m.accountId}-${m.id}`}
                  type="button"
                  onClick={() => setSelected({ accountId: m.accountId, messageId: m.id })}
                  className={`block w-full px-6 py-4 text-left transition ${
                    active ? "bg-primary/[0.07]" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    {m.unread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span
                      className={`truncate text-[15px] ${
                        m.unread ? "font-semibold" : "font-normal text-foreground/85"
                      }`}
                    >
                      {addressLabel(m.from)}
                    </span>
                    <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
                      {messageTime(m.date)}
                    </span>
                  </div>

                  <p
                    className={`mt-1 truncate text-[15px] ${
                      m.unread ? "font-medium" : "text-foreground/80"
                    }`}
                  >
                    {m.subject || "(sans objet)"}
                  </p>

                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {m.snippet}
                  </p>

                  {(m.starred || m.hasAttachments || (accountId === null && accounts.length > 1)) && (
                    <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                      {m.starred && <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />}
                      {m.hasAttachments && <Paperclip className="h-3.5 w-3.5" />}
                      {accountId === null && accounts.length > 1 && (
                        <span className="truncate text-[11px]">{m.accountEmail}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Lecture */}
        <section
          className={`min-w-0 flex-1 flex-col bg-background ${
            selected ? "flex" : "hidden lg:flex"
          }`}
        >
          {!selected && (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <MailOpen className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-4 text-[15px] text-muted-foreground">
                Sélectionnez un message pour le lire.
              </p>
            </div>
          )}

          {selected && loadingMessage && (
            <p className="px-10 py-10 text-[15px] text-muted-foreground">Ouverture du message…</p>
          )}

          {selected && message && (
            <>
              <div className="px-10 pb-5 pt-7">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 -ml-2 rounded-full lg:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Retour
                </Button>

                <h2 className="text-[22px] font-semibold leading-tight tracking-tight">
                  {message.subject || "(sans objet)"}
                </h2>

                <div className="mt-5 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary">
                    {initialsFrom(addressLabel(message.from))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">
                      {addressLabel(message.from)}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      À {message.to.map(addressLabel).join(", ") || "—"}
                      {message.cc.length
                        ? ` · Cc ${message.cc.map(addressLabel).join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {new Date(message.date).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-0.5">
                  <IconBtn
                    label="Répondre"
                    onClick={() => {
                      setSeed({
                        accountId: message.accountId,
                        to: message.from?.address ?? "",
                        subject: `Re : ${message.subject}`,
                        body: `\n\n---\n${message.text ?? ""}`,
                        replyTo: message.id,
                      });
                      setComposeOpen(true);
                    }}
                  >
                    <CornerUpLeft className="h-[18px] w-[18px]" />
                  </IconBtn>
                  <IconBtn
                    label="Transférer"
                    onClick={() => {
                      setSeed({
                        accountId: message.accountId,
                        subject: `Tr : ${message.subject}`,
                        body: `\n\n---\n${message.text ?? ""}`,
                        forwardOf: message.id,
                      });
                      setComposeOpen(true);
                    }}
                  >
                    <Forward className="h-[18px] w-[18px]" />
                  </IconBtn>
                  <IconBtn
                    label={message.starred ? "Retirer des favoris" : "Marquer comme favori"}
                    onClick={() =>
                      flag.mutate({
                        accountId: message.accountId,
                        messageId: message.id,
                        starred: !message.starred,
                      })
                    }
                  >
                    <Star
                      className={`h-[18px] w-[18px] ${
                        message.starred ? "fill-amber-500 text-amber-500" : ""
                      }`}
                    />
                  </IconBtn>
                  <IconBtn
                    label="Marquer comme non lu"
                    onClick={() =>
                      flag.mutate({
                        accountId: message.accountId,
                        messageId: message.id,
                        read: false,
                      })
                    }
                  >
                    <MailOpen className="h-[18px] w-[18px]" />
                  </IconBtn>
                  <IconBtn
                    label="Archiver"
                    onClick={() =>
                      move.mutate({
                        accountId: message.accountId,
                        messageId: message.id,
                        folder: "archive",
                      })
                    }
                  >
                    <Archive className="h-[18px] w-[18px]" />
                  </IconBtn>
                  <IconBtn
                    label="Supprimer"
                    danger
                    onClick={() =>
                      remove.mutate({ accountId: message.accountId, messageId: message.id })
                    }
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                  </IconBtn>
                </div>
              </div>

              <div className="h-px bg-border/40" />

              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[68ch] px-10 py-8">
                  {message.attachments.length > 0 && (
                    <div className="mb-8 rounded-xl bg-muted/40 p-4">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {message.attachments.length} pièce
                        {message.attachments.length > 1 ? "s" : ""} jointe
                        {message.attachments.length > 1 ? "s" : ""}
                      </p>
                      <div className="space-y-2">
                        {message.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-3 rounded-lg bg-background px-3.5 py-2.5"
                          >
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-[14px]">
                              {att.filename}
                            </span>
                            <span className="shrink-0 text-[12px] text-muted-foreground">
                              {formatBytes(att.size)}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 rounded-full"
                              aria-label={`Télécharger ${att.filename}`}
                              onClick={() => void download(att.id, att.filename)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.html ? (
                    <iframe
                      title="Contenu du message"
                      sandbox=""
                      className="h-[58vh] min-h-[360px] w-full rounded-lg border-0 bg-white"
                      srcDoc={message.html}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.75] text-foreground/90">
                      {message.text ?? "(message vide)"}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <ComposeMailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        seed={seed}
      />
    </div>
  );
}
