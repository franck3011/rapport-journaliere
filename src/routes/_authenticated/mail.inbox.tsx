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
  Reply,
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

function ToolButton({
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
      className="h-8 w-8 rounded-md"
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
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Inbox className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">Aucun compte e-mail connecté</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ajoutez un compte Gmail ou Outlook dans les paramètres de la messagerie pour retrouver
          tous vos messages ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barre supérieure */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Inbox className="h-5 w-5 text-primary" />
          Messagerie
        </h1>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
              onBlur={() => setApplied(search.trim())}
              placeholder="Rechercher…"
              className="h-9 w-full rounded-md pl-9"
              aria-label="Rechercher dans les e-mails"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            aria-label="Relever le courrier"
            title="Relever le courrier"
          >
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            className="h-9 shrink-0"
            onClick={() => {
              setSeed(undefined);
              setComposeOpen(true);
            }}
          >
            <Pen className="mr-2 h-4 w-4" />
            Rédiger
          </Button>
        </div>
      </div>

      {(listing?.errors?.length ?? 0) > 0 && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>{listing!.errors.join(" · ")}</AlertDescription>
        </Alert>
      )}

      {/* Filtres mobiles (le rail est masqué en dessous de lg) */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Select
          value={folder}
          onValueChange={(v) => {
            setFolder(v as MailFolderKind);
            setSelected(null);
          }}
        >
          <SelectTrigger className="h-9 w-[140px] rounded-md">
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
          <SelectTrigger className="h-9 min-w-0 flex-1 rounded-md">
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
          className="h-9 rounded-md"
          onClick={() => setUnreadOnly((v) => !v)}
        >
          Non lus
        </Button>
      </div>

      {/* Coque façon client de messagerie */}
      <div className="flex min-h-[560px] overflow-hidden rounded-lg border bg-background lg:h-[calc(100dvh-11rem)]">
        {/* Rail : comptes et dossiers */}
        <aside className="hidden w-[232px] shrink-0 flex-col border-r bg-muted/20 lg:flex">
          <div className="p-3">
            <Button
              className="w-full justify-start"
              onClick={() => {
                setSeed(undefined);
                setComposeOpen(true);
              }}
            >
              <Pen className="mr-2 h-4 w-4" />
              Nouveau message
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 pb-3">
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dossiers
            </p>
            {FOLDER_ORDER.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFolder(f);
                  setSelected(null);
                }}
                className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition ${
                  folder === f
                    ? "bg-primary/10 font-medium text-primary"
                    : "hover:bg-muted"
                }`}
              >
                {FOLDER_LABELS[f]}
              </button>
            ))}

            <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Comptes
            </p>
            <button
              type="button"
              onClick={() => setAccountId(null)}
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition ${
                accountId === null ? "bg-muted font-medium" : "hover:bg-muted"
              }`}
            >
              Tous les comptes
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left transition ${
                  accountId === a.id ? "bg-muted" : "hover:bg-muted"
                }`}
              >
                <span className="truncate text-sm">{a.email}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {PROVIDER_LABELS[a.provider]}
                </span>
              </button>
            ))}
          </nav>

          <div className="space-y-2 border-t p-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Non lus
            </label>
            <label className="flex cursor-pointer items-center gap-2">
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
          className={`flex min-w-0 flex-col border-r ${
            selected ? "hidden lg:flex" : "flex"
          } lg:w-[380px] lg:shrink-0`}
        >
          <header className="flex items-center gap-2 border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">{FOLDER_LABELS[folder]}</h2>
            <span className="text-xs text-muted-foreground">{messages.length}</span>
            {(isFetching || isLoading) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            {!isLoading && messages.length === 0 && (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium">Aucun message</p>
                <p className="mt-1 text-xs text-muted-foreground">
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
                  className={`block w-full border-b px-4 py-3 text-left transition ${
                    active
                      ? "bg-primary/5"
                      : m.unread
                        ? "bg-background hover:bg-muted/50"
                        : "bg-muted/10 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`truncate text-sm ${
                        m.unread ? "font-semibold" : "text-foreground/80"
                      }`}
                    >
                      {addressLabel(m.from)}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {messageTime(m.date)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-1.5">
                    {m.starred && (
                      <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
                    )}
                    <p
                      className={`truncate text-sm ${
                        m.unread ? "font-medium" : "text-foreground/80"
                      }`}
                    >
                      {m.subject || "(sans objet)"}
                    </p>
                    {m.hasAttachments && (
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                  </div>

                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.snippet}</p>

                  {accountId === null && (
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {m.accountEmail}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Lecture */}
        <section
          className={`min-w-0 flex-1 flex-col ${
            selected ? "flex" : "hidden lg:flex"
          }`}
        >
          {!selected && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MailOpen className="h-9 w-9 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Sélectionnez un message pour le lire.
              </p>
            </div>
          )}

          {selected && loadingMessage && (
            <p className="px-6 py-8 text-sm text-muted-foreground">Ouverture du message…</p>
          )}

          {selected && message && (
            <>
              {/* En-tête du message */}
              <div className="border-b px-6 py-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 -ml-2 lg:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Retour
                </Button>

                <div className="flex items-start gap-3">
                  <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug">
                    {message.subject || "(sans objet)"}
                  </h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(message.date).toLocaleString("fr-FR")}
                  </span>
                </div>

                <div className="mt-2 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{addressLabel(message.from)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      À {message.to.map(addressLabel).join(", ") || "—"}
                      {message.cc.length
                        ? ` · Cc ${message.cc.map(addressLabel).join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {message.accountEmail}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1">
                  <ToolButton
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
                    <Reply className="h-4 w-4" />
                  </ToolButton>
                  <ToolButton
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
                    <Forward className="h-4 w-4" />
                  </ToolButton>

                  <span className="mx-1 h-5 w-px bg-border" />

                  <ToolButton
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
                      className={`h-4 w-4 ${message.starred ? "fill-amber-500 text-amber-500" : ""}`}
                    />
                  </ToolButton>
                  <ToolButton
                    label="Marquer comme non lu"
                    onClick={() =>
                      flag.mutate({
                        accountId: message.accountId,
                        messageId: message.id,
                        read: false,
                      })
                    }
                  >
                    <MailOpen className="h-4 w-4" />
                  </ToolButton>
                  <ToolButton
                    label="Archiver"
                    onClick={() =>
                      move.mutate({
                        accountId: message.accountId,
                        messageId: message.id,
                        folder: "archive",
                      })
                    }
                  >
                    <Archive className="h-4 w-4" />
                  </ToolButton>
                  <ToolButton
                    label="Supprimer"
                    danger
                    onClick={() =>
                      remove.mutate({ accountId: message.accountId, messageId: message.id })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </ToolButton>
                </div>
              </div>

              {/* Corps du message */}
              <div className="flex-1 overflow-y-auto bg-background">
                <div className="mx-auto max-w-[72ch] px-6 py-6">
                  {message.attachments.length > 0 && (
                    <div className="mb-6 rounded-lg border bg-muted/20 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {message.attachments.length} pièce
                        {message.attachments.length > 1 ? "s" : ""} jointe
                        {message.attachments.length > 1 ? "s" : ""}
                      </p>
                      <div className="space-y-2">
                        {message.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                          >
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm">{att.filename}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatBytes(att.size)}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0"
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
                      className="h-[55vh] min-h-[340px] w-full rounded-md border bg-white"
                      srcDoc={message.html}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-foreground/90">
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
