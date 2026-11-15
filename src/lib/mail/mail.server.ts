import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret } from "./crypto.server";
import {
  deleteGatewayAccount,
  verifyImapCredentials,
  type ImapCredentials,
} from "./gateway.server";
import { transportForRow, type MailTransport } from "./transport.server";

import {
  FOLDER_LABELS,
  FOLDER_ORDER,
  type MailAccount,
  type MailFilters,
  type MailFolder,
  type MailFolderKind,
  type MailMessageFull,
  type MailMessageSummary,
} from "./types";

const PUBLIC_COLUMNS =
  "id, provider, email, display_name, label, status, status_message, is_primary, signature, signature_mode, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, imap_username, unread_count, last_sync_at";

type AdminClient = SupabaseClient<any>;

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

/* ------------------------------------------------------------------ */
/* Journalisation (jamais de contenu de message)                       */
/* ------------------------------------------------------------------ */

export async function logMailEvent(
  userId: string,
  accountId: string | null,
  action: string,
  status: "success" | "error",
  errorMessage?: string | null,
) {
  try {
    const db = await admin();
    await db.from("email_sync_logs").insert({
      user_id: userId,
      account_id: accountId,
      action,
      status,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
    });
  } catch (e) {
    console.error("[mail] journalisation impossible", e);
  }
}

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

/** La messagerie est incluse à partir du plan qui la déclare (Équipe). */
async function assertMailPlan(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  const { loadModuleState, hasFeature } = await import("@/lib/modules/modules.server");
  const state = await loadModuleState(supabase, userId);
  if (!hasFeature(state, "messagerie")) {
    throw new Error(
      "La messagerie est incluse à partir du plan Équipe. Changez de formule depuis la page Abonnement.",
    );
  }
}
export async function listAccountsFor(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<MailAccount[]> {
  const { data, error } = await supabase
    .from("email_accounts")
    .select(PUBLIC_COLUMNS)
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MailAccount[];
}

/** Compte + secrets déchiffrés — usage serveur uniquement. */
export async function loadAccountWithSecrets(userId: string, accountId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("email_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Compte e-mail introuvable.");
  return data as any;
}

export type ImapInput = {
  provider: "imap" | "yahoo" | "gmail" | "microsoft";
  email: string;
  displayName?: string | null;
  label?: string | null;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
};

function toCredentials(input: ImapInput): ImapCredentials {
  return {
    email: input.email,
    displayName: input.displayName ?? null,
    username: input.username,
    password: input.password,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapSecure: input.imapSecurity.toUpperCase().includes("SSL"),
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: !input.smtpSecurity.toUpperCase().includes("STARTTLS"),
  };
}

/** Test de connexion sans enregistrement. */
export async function testImapConnection(input: ImapInput): Promise<void> {
  await verifyImapCredentials(toCredentials(input));
}

export async function saveImapAccountFor(
  userId: string,
  input: ImapInput,
): Promise<MailAccount> {
  const creds = toCredentials(input);
  // 1. test obligatoire avant enregistrement
  await verifyImapCredentials(creds);

  const db = await admin();
  const { count } = await db
    .from("email_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data, error } = await db
    .from("email_accounts")
    .upsert(
      {
        user_id: userId,
        provider: input.provider,
        email: input.email,
        display_name: input.displayName ?? null,
        label: input.label ?? null,
        status: "connected",
        status_message: null,
        is_primary: (count ?? 0) === 0,
        imap_username: input.username,
        imap_password_ciphertext: encryptSecret(input.password),
        imap_host: input.imapHost,
        imap_port: input.imapPort,
        imap_security: input.imapSecurity,
        smtp_host: input.smtpHost,
        smtp_port: input.smtpPort,
        smtp_security: input.smtpSecurity,
      },
      { onConflict: "user_id,provider,email" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // 2. enregistrement dans la passerelle sous l'identifiant du compte
  const { upsertGatewayAccount } = await import("./gateway.server");
  await upsertGatewayAccount(data.id as string, creds);

  await db
    .from("email_accounts")
    .update({ gateway_account_id: data.id, last_sync_at: new Date().toISOString() })
    .eq("id", data.id);
  await logMailEvent(userId, data.id as string, "account.connect", "success");

  const { data: pub } = await db
    .from("email_accounts")
    .select(PUBLIC_COLUMNS)
    .eq("id", data.id)
    .single();
  return pub as unknown as MailAccount;
}

/** Charge le compte et prépare le transport (API OAuth ou passerelle IMAP). */
export async function accountTransport(userId: string, accountId: string) {
  const row = await loadAccountWithSecrets(userId, accountId);
  const transport = await transportForRow(row);
  return { row, transport };
}

/** Compatibilité : (re)pousse les identifiants stockés vers la passerelle. */
export async function ensureGatewayAccount(userId: string, accountId: string) {
  const { row } = await accountTransport(userId, accountId);
  return row;
}


export async function deleteAccountFor(userId: string, accountId: string) {
  const db = await admin();
  await deleteGatewayAccount(accountId);
  const { error } = await db
    .from("email_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await logMailEvent(userId, null, "account.delete", "success");
}

/* ------------------------------------------------------------------ */
/* Dossiers                                                            */
/* ------------------------------------------------------------------ */

function fallbackFolders(): MailFolder[] {
  return FOLDER_ORDER.map((kind) => ({
    id: kind,
    kind,
    name: FOLDER_LABELS[kind],
    path: kind === "inbox" ? "INBOX" : kind,
    unread: 0,
  }));
}

async function orderFolders(remote: MailFolder[]): Promise<MailFolder[]> {
  const known = new Map<MailFolderKind, MailFolder>();
  for (const f of remote) if (f.kind !== "custom" && !known.has(f.kind)) known.set(f.kind, f);
  const ordered = FOLDER_ORDER.map(
    (kind) =>
      known.get(kind) ?? {
        id: kind,
        kind,
        name: FOLDER_LABELS[kind],
        path: kind === "inbox" ? "INBOX" : kind,
        unread: 0,
      },
  );
  return [...ordered, ...remote.filter((f) => f.kind === "custom")];
}

export async function foldersFor(
  userId: string,
  accountId: string,
): Promise<MailFolder[]> {
  try {
    const { transport } = await accountTransport(userId, accountId);
    return await orderFolders(await transport.listFolders());
  } catch (e) {
    console.error("[mail] dossiers indisponibles", e);
    return fallbackFolders();
  }
}

async function pathForFolder(
  transport: MailTransport,
  folder: MailFolderKind,
): Promise<string> {
  if (folder === "inbox" || folder === "starred") return "INBOX";
  try {
    const folders = await orderFolders(await transport.listFolders());
    return folders.find((f) => f.kind === folder)?.path ?? "INBOX";
  } catch {
    return folder;
  }
}


/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export async function messagesFor(
  supabase: SupabaseClient<any>,
  userId: string,
  filters: MailFilters,
): Promise<{ messages: MailMessageSummary[]; errors: string[] }> {
  const accounts = (await listAccountsFor(supabase, userId)).filter(
    (a) => a.status !== "disabled",
  );
  const targets = filters.accountId
    ? accounts.filter((a) => a.id === filters.accountId)
    : accounts;

  const folder = filters.folder ?? "inbox";
  const errors: string[] = [];
  const results = await Promise.all(
    targets.map(async (acc) => {
      try {
        const { transport } = await accountTransport(userId, acc.id);
        const path = await pathForFolder(transport, folder);
        const list = await transport.listMessages({
          path,
          search: filters.search,
          from: filters.from,
          to: filters.to,
          subject: filters.subject,
          since: filters.since,
          until: filters.until,
          unreadOnly: filters.unreadOnly,
          starredOnly: filters.starredOnly || folder === "starred",
        });
        return list.map((m) => ({ ...m, provider: acc.provider }));

      } catch (e) {
        const msg = e instanceof Error ? e.message : "Synchronisation interrompue.";
        errors.push(`${acc.email} : ${msg}`);
        await logMailEvent(userId, acc.id, "messages.list", "error", msg);
        return [] as MailMessageSummary[];
      }
    }),
  );

  let messages = results.flat();
  if (filters.withAttachments) messages = messages.filter((m) => m.hasAttachments);
  if (filters.importantOnly) messages = messages.filter((m) => m.important);
  if (filters.unreadOnly) messages = messages.filter((m) => m.unread);
  if (filters.starredOnly || folder === "starred")
    messages = messages.filter((m) => m.starred);
  messages.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { messages, errors };
}

export async function messageFor(
  userId: string,
  accountId: string,
  messageId: string,
): Promise<MailMessageFull> {
  const { row, transport } = await accountTransport(userId, accountId);
  const full = await transport.getMessage(messageId);
  return { ...full, provider: row.provider };
}

export async function flagFor(
  userId: string,
  accountId: string,
  messageId: string,
  change: { read?: boolean; starred?: boolean },
) {
  const { transport } = await accountTransport(userId, accountId);
  const add: string[] = [];
  const remove: string[] = [];
  if (change.read === true) add.push("\\Seen");
  if (change.read === false) remove.push("\\Seen");
  if (change.starred === true) add.push("\\Flagged");
  if (change.starred === false) remove.push("\\Flagged");
  await transport.setFlags(messageId, add, remove);
}

export async function moveFor(
  userId: string,
  accountId: string,
  messageId: string,
  folder: MailFolderKind,
) {
  const { transport } = await accountTransport(userId, accountId);
  const path = await pathForFolder(transport, folder);
  await transport.move(messageId, path);
}

export async function trashFor(userId: string, accountId: string, messageId: string) {
  const { transport } = await accountTransport(userId, accountId);
  await transport.remove(messageId);
  await logMailEvent(userId, accountId, "message.delete", "success");
}

export async function attachmentFor(
  userId: string,
  accountId: string,
  attachmentId: string,
) {
  const { transport } = await accountTransport(userId, accountId);
  return transport.attachment(attachmentId);
}


export type SendInput = {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  replyTo?: string | null;
  forwardOf?: string | null;
  attachments?: { filename: string; content: string; contentType: string }[];
};

export async function sendFor(userId: string, input: SendInput) {
  const { row, transport } = await accountTransport(userId, input.accountId);
  const signature =
    row.signature_mode === "auto" && row.signature
      ? `<br/><br/><div class="signature">${row.signature}</div>`
      : "";
  try {
    await transport.submit({

      from: { name: row.display_name, address: row.email },
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: `${input.html}${signature}`,
      reference: input.replyTo
        ? { message: input.replyTo, action: "reply" }
        : input.forwardOf
          ? { message: input.forwardOf, action: "forward" }
          : null,
      attachments: input.attachments,
    });
    await logMailEvent(userId, input.accountId, "message.send", "success");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Envoi impossible.";
    await logMailEvent(userId, input.accountId, "message.send", "error", msg);
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Synchronisation                                                     */
/* ------------------------------------------------------------------ */

export async function syncAccountFor(
  userId: string,
  accountId: string,
): Promise<{ unread: number }> {
  const db = await admin();
  try {
    const { transport } = await accountTransport(userId, accountId);
    const folders = await orderFolders(await transport.listFolders());

    const inbox = folders.find((f) => f.kind === "inbox");
    const unread = inbox?.unread ?? 0;

    await db.from("email_folders").upsert(
      folders.map((f, i) => ({
        account_id: accountId,
        user_id: userId,
        name: f.name,
        kind: f.kind,
        provider_folder_id: f.path,
        unread_count: f.unread,
        position: i,
      })),
      { onConflict: "account_id,provider_folder_id" },
    );
    await db
      .from("email_accounts")
      .update({
        unread_count: unread,
        last_sync_at: new Date().toISOString(),
        status: "connected",
        status_message: null,
      })
      .eq("id", accountId)
      .eq("user_id", userId);
    await logMailEvent(userId, accountId, "account.sync", "success");
    return { unread };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Synchronisation interrompue.";
    await db
      .from("email_accounts")
      .update({ status: "error", status_message: msg })
      .eq("id", accountId)
      .eq("user_id", userId);
    await logMailEvent(userId, accountId, "account.sync", "error", msg);
    throw e;
  }
}

export async function syncAllFor(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<{ unread: number; errors: string[] }> {
  const accounts = (await listAccountsFor(supabase, userId)).filter(
    (a) => a.status !== "disabled",
  );
  let unread = 0;
  const errors: string[] = [];
  for (const acc of accounts) {
    try {
      const r = await syncAccountFor(userId, acc.id);
      unread += r.unread;
    } catch (e) {
      errors.push(`${acc.email} : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
  return { unread, errors };
}
