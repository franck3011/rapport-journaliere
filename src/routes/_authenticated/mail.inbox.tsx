import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      { title: "Boîte unifiée — DailyBrief" },
      {
        name: "description",
        content:
          "Lisez, répondez, classez et recherchez tous vos e-mails multi-comptes depuis une boîte unifiée.",
      },
      { property: "og:title", content: "Boîte unifiée — DailyBrief" },
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
      className="h-9 w-9 rounded-lg"
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
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Inbox className="h-5 w-5 text-primary" />
          Boîte unifiée
        </h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
              onBlur={() => setApplied(search.trim())}
              placeholder="Rechercher un objet, un expéditeur…"
              className="h-9 w-64 rounded-lg pl-9"
              aria-label="Rechercher dans les e-mails"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Relever
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-lg"
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

      <div className="grid gap-4 lg:h-[calc(100dvh-13rem)] lg:min-h-[540px] lg:grid-cols-[220px_360px_minmax(0,1fr)]">
        {/* Colonne 1 : comptes et dossiers */}
        <aside className="min-h-0 space-y-5 overflow-y-auto rounded-xl border bg-card p-3 lg:pr-2">
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Comptes
            </p>
            <button
              type="button"
              onClick={() => setAccountId(null)}
              className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
                accountId === null ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
              }`}
            >
              Tous les comptes
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                  accountId === a.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <span className="block truncate text-sm">{a.email}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {PROVIDER_LABELS[a.provider]}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-0.5 border-t pt-4">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
                className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  folder === f ? "bg-muted font-medium" : "hover:bg-muted"
                }`}
              >
                {FOLDER_LABELS[f]}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 border-t pt-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 px-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Non lus
            </label>
            <label className="flex cursor-pointer items-center gap-2 px-2">
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

        {/* Colonne 2 : liste des messages */}
        <section className="min-h-0 overflow-y-auto rounded-xl border bg-card">
          {(isLoading || isFetching) && messages.length === 0 && (
            <p className="px-5 py-8 text-sm text-muted-foreground">Chargement des messages…</p>
          )}
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
                className={`block w-full border-b px-4 py-3.5 text-left transition last:border-b-0 ${
                  active ? "bg-primary/5" : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  {m.unread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span
                    className={`truncate text-sm ${m.unread ? "font-semibold" : "font-normal"}`}
                  >
                    {addressLabel(m.from)}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {messageTime(m.date)}
                  </span>
                </div>

                <p
                  className={`mt-1 truncate text-sm ${
                    m.unread ? "font-medium text-foreground" : "text-foreground/80"
                  }`}
                >
                  {m.subject || "(sans objet)"}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {m.snippet}
                </p>

                <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                  {m.hasAttachments && <Paperclip className="h-3.5 w-3.5" aria-label="Pièce jointe" />}
                  {m.starred && <Star className="h-3.5 w-3.5 text-amber-500" aria-label="Favori" />}
                  {accountId === null && (
                    <span className="truncate text-[10px]">{m.accountEmail}</span>
                  )}
                </div>
              </button>
            );
          })}
        </section>

        {/* Colonne 3 : lecture */}
        <section className="min-h-0 overflow-y-auto rounded-xl border bg-card">
          {!selected && (
            <div className="flex h-full flex-col items-center justify-center px-6 py-20 text-center">
              <MailOpen className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Sélectionnez un message pour le lire.
              </p>
            </div>
          )}
          {selected && loadingMessage && (
            <p className="px-6 py-8 text-sm text-muted-foreground">Ouverture du message…</p>
          )}
          {selected && message && (
            <div className="flex h-full flex-col">
              {/* En-tête du message */}
              <div className="border-b px-6 py-5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 -ml-2 lg:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Retour
                </Button>

                <h2 className="text-xl font-semibold leading-snug">
                  {message.subject || "(sans objet)"}
                </h2>

                <div className="mt-3 flex items-start gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{addressLabel(message.from)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      À {message.to.map(addressLabel).join(", ") || "—"}
                      {message.cc.length
                        ? ` · Cc ${message.cc.map(addressLabel).join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {new Date(message.date).toLocaleString("fr-FR")}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-1">
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
                    <CornerUpLeft className="h-4 w-4" />
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

                  <span className="ml-auto truncate text-[11px] text-muted-foreground">
                    {message.accountEmail}
                  </span>
                </div>
              </div>

              {/* Corps du message */}
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[72ch] px-6 py-6">
                  {message.attachments.length > 0 && (
                    <div className="mb-6 rounded-xl border bg-muted/30 p-4">
                      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {message.attachments.length} pièce
                        {message.attachments.length > 1 ? "s" : ""} jointe
                        {message.attachments.length > 1 ? "s" : ""}
                      </p>
                      <div className="space-y-2">
                        {message.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
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
                      className="h-[60vh] min-h-[380px] w-full rounded-lg border bg-white"
                      srcDoc={message.html}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-foreground/90">
                      {message.text ?? "(message vide)"}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <ComposeMailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        seed={seed}
      />

      <p className="text-xs text-muted-foreground">
        Les contenus d'e-mails ne sont jamais stockés : ils sont lus en direct depuis votre
        messagerie.
      </p>
    </div>
  );
}
