import type {
  MailAddress,
  MailAttachment,
  MailFolder,
  MailFolderKind,
  MailMessageFull,
  MailMessageSummary,
} from "./types";
import type { GatewayQuery, OutgoingMessage } from "./gateway.server";
import { buildMime, toBase64Url } from "./mime.server";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const LABEL_BY_KIND: Partial<Record<MailFolderKind, string>> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  spam: "SPAM",
  trash: "TRASH",
  starred: "STARRED",
};

const KIND_BY_LABEL: Record<string, MailFolderKind> = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFT: "drafts",
  SPAM: "spam",
  TRASH: "trash",
  STARRED: "starred",
};

async function api<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> },
): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {}))
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[gmail] ${init?.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
    if (res.status === 401)
      throw new Error(
        "La session Gmail a expiré. Reconnectez le compte depuis les paramètres de messagerie.",
      );
    if (res.status === 403)
      throw new Error(
        "Le compte n'a pas accordé les droits nécessaires (lecture et envoi). Reconnectez-le en acceptant toutes les autorisations.",
      );
    throw new Error("Gmail a refusé l'opération. Réessayez dans un instant.");
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function header(headers: any[], name: string): string {
  return (
    headers?.find((h) => String(h.name).toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function parseAddress(raw: string): MailAddress | null {
  if (!raw) return null;
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] ?? "").trim() || null, address: (m[2] ?? "").trim() };
  return { name: null, address: raw.trim() };
}

function parseAddressList(raw: string): MailAddress[] {
  return raw
    .split(",")
    .map((p) => parseAddress(p))
    .filter((a): a is MailAddress => !!a && !!a.address);
}

function summarize(m: any, accountId: string, accountEmail: string): MailMessageSummary {
  const headers = m.payload?.headers ?? [];
  const labels: string[] = m.labelIds ?? [];
  return {
    id: String(m.id),
    accountId,
    accountEmail,
    provider: "gmail",
    threadId: m.threadId ?? null,
    from: parseAddress(header(headers, "From")),
    to: parseAddressList(header(headers, "To")),
    subject: header(headers, "Subject") || "(sans objet)",
    snippet: String(m.snippet ?? "").slice(0, 220),
    date: m.internalDate
      ? new Date(Number(m.internalDate)).toISOString()
      : new Date().toISOString(),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    important: labels.includes("IMPORTANT"),
    hasAttachments: hasAttachment(m.payload),
  };
}

function hasAttachment(payload: any): boolean {
  if (!payload) return false;
  if (payload.filename && payload.body?.attachmentId) return true;
  return (payload.parts ?? []).some((p: any) => hasAttachment(p));
}

function collectBody(payload: any, out: { html: string | null; text: string | null }) {
  if (!payload) return;
  const mime = String(payload.mimeType ?? "");
  const data = payload.body?.data;
  if (data && mime === "text/html" && !out.html)
    out.html = Buffer.from(data, "base64url").toString("utf8");
  if (data && mime === "text/plain" && !out.text)
    out.text = Buffer.from(data, "base64url").toString("utf8");
  for (const p of payload.parts ?? []) collectBody(p, out);
}

function collectAttachments(payload: any, messageId: string, out: MailAttachment[]) {
  if (!payload) return;
  if (payload.filename && payload.body?.attachmentId)
    out.push({
      id: `${messageId}:${payload.body.attachmentId}`,
      filename: payload.filename,
      mimeType: payload.mimeType ?? "application/octet-stream",
      size: Number(payload.body.size ?? 0),
    });
  for (const p of payload.parts ?? []) collectAttachments(p, messageId, out);
}

function searchQuery(q: GatewayQuery): string {
  const parts: string[] = [];
  if (q.search) parts.push(q.search);
  if (q.from) parts.push(`from:${q.from}`);
  if (q.to) parts.push(`to:${q.to}`);
  if (q.subject) parts.push(`subject:${q.subject}`);
  if (q.since) parts.push(`after:${q.since.slice(0, 10).replace(/-/g, "/")}`);
  if (q.until) parts.push(`before:${q.until.slice(0, 10).replace(/-/g, "/")}`);
  if (q.unreadOnly) parts.push("is:unread");
  if (q.starredOnly) parts.push("is:starred");
  return parts.join(" ");
}

export function gmailTransport(
  accountId: string,
  accountEmail: string,
  getToken: () => Promise<string>,
) {
  return {
    async listFolders(): Promise<MailFolder[]> {
      const token = await getToken();
      const res = await api<{ labels?: any[] }>(token, "/labels");
      const system = (res.labels ?? []).filter(
        (l) => KIND_BY_LABEL[String(l.id)] !== undefined,
      );
      const detailed = await Promise.all(
        system.map(async (l) => {
          try {
            const d = await api<any>(token, `/labels/${encodeURIComponent(l.id)}`);
            return { ...l, unread: Number(d.messagesUnread ?? 0) };
          } catch {
            return { ...l, unread: 0 };
          }
        }),
      );
      const folders: MailFolder[] = detailed.map((l) => ({
        id: String(l.id),
        path: String(l.id),
        name: String(l.name ?? l.id),
        kind: KIND_BY_LABEL[String(l.id)] ?? "custom",
        unread: l.unread,
      }));
      folders.push({
        id: "ARCHIVE",
        path: "ARCHIVE",
        name: "Archives",
        kind: "archive",
        unread: 0,
      });
      return folders;
    },

    async listMessages(q: GatewayQuery): Promise<MailMessageSummary[]> {
      const token = await getToken();
      const kind = (Object.keys(LABEL_BY_KIND) as MailFolderKind[]).find(
        (k) => LABEL_BY_KIND[k] === q.path,
      );
      const label = q.path === "ARCHIVE" ? undefined : (LABEL_BY_KIND[kind ?? "inbox"] ?? q.path);
      const search = searchQuery(q);
      const list = await api<{ messages?: { id: string }[] }>(token, "/messages", {
        query: {
          maxResults: q.pageSize ?? 30,
          ...(label ? { labelIds: label } : {}),
          ...(search ? { q: search } : { q: q.path === "ARCHIVE" ? "-in:inbox" : "" }),
        },
      });
      const ids = (list.messages ?? []).map((m) => m.id);
      const full = await Promise.all(
        ids.map(async (id) => {
          try {
            return await api<any>(token, `/messages/${encodeURIComponent(id)}`, {
              query: { format: "metadata" },
            });
          } catch {
            return null;
          }
        }),
      );
      return full
        .filter((m): m is any => Boolean(m))
        .map((m) => summarize(m, accountId, accountEmail));

    },

    async getMessage(messageId: string): Promise<MailMessageFull> {
      const token = await getToken();
      const m = await api<any>(token, `/messages/${encodeURIComponent(messageId)}`, {
        query: { format: "full" },
      });
      const body: { html: string | null; text: string | null } = { html: null, text: null };
      collectBody(m.payload, body);
      const attachments: MailAttachment[] = [];
      collectAttachments(m.payload, messageId, attachments);
      const headers = m.payload?.headers ?? [];
      return {
        ...summarize(m, accountId, accountEmail),
        cc: parseAddressList(header(headers, "Cc")),
        bcc: parseAddressList(header(headers, "Bcc")),
        html: body.html,
        text: body.text,
        attachments,
      };
    },

    async setFlags(messageId: string, add: string[], remove: string[]): Promise<void> {
      const token = await getToken();
      const map = (flags: string[]): string[] => {
        const out: string[] = [];
        for (const f of flags) {
          if (f === "\\Seen") out.push("UNREAD");
          else if (f === "\\Flagged") out.push("STARRED");
        }
        return out;
      };


      // \Seen ajouté ⇒ retirer UNREAD (logique inversée pour Gmail)
      const addLabelIds = [
        ...map(remove).filter((l) => l === "UNREAD"),
        ...map(add).filter((l) => l === "STARRED"),
      ];
      const removeLabelIds = [
        ...map(add).filter((l) => l === "UNREAD"),
        ...map(remove).filter((l) => l === "STARRED"),
      ];
      await api(token, `/messages/${encodeURIComponent(messageId)}/modify`, {
        method: "POST",
        body: { addLabelIds, removeLabelIds },
      });
    },

    async move(messageId: string, path: string): Promise<void> {
      const token = await getToken();
      const target = path === "ARCHIVE" ? null : path;
      await api(token, `/messages/${encodeURIComponent(messageId)}/modify`, {
        method: "POST",
        body: {
          addLabelIds: target ? [target] : [],
          removeLabelIds: ["INBOX"],
        },
      });
    },

    async remove(messageId: string): Promise<void> {
      const token = await getToken();
      await api(token, `/messages/${encodeURIComponent(messageId)}/trash`, {
        method: "POST",
        body: {},
      });
    },

    async attachment(id: string): Promise<{ base64: string; mimeType: string }> {
      const token = await getToken();
      const [messageId, attachmentId] = id.split(":");
      if (!messageId || !attachmentId) throw new Error("Pièce jointe introuvable.");
      const res = await api<{ data?: string }>(
        token,
        `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      const buf = Buffer.from(res.data ?? "", "base64url");
      return { base64: buf.toString("base64"), mimeType: "application/octet-stream" };
    },

    async submit(msg: OutgoingMessage): Promise<void> {
      const token = await getToken();
      await api(token, "/messages/send", {
        method: "POST",
        body: { raw: toBase64Url(buildMime(msg)) },
      });
    },
  };
}
