import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto.server";

/**
 * Connexion Gmail / Outlook par OAuth (API HTTPS officielles).
 * Aucun socket IMAP/SMTP requis : compatible avec le runtime serveur.
 */

export type OAuthProvider = "gmail" | "microsoft";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const MS_SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
];

export function oauthClient(provider: OAuthProvider): { id: string; secret: string } | null {
  if (provider === "gmail") {
    const id = process.env["MAIL_GOOGLE_CLIENT_ID"] ?? process.env["GOOGLE_OAUTH_CLIENT_ID"];
    const secret =
      process.env["MAIL_GOOGLE_CLIENT_SECRET"] ?? process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
    return id && secret ? { id, secret } : null;
  }
  const id = process.env["MAIL_MICROSOFT_CLIENT_ID"] ?? process.env["MS_OAUTH_CLIENT_ID"];
  const secret =
    process.env["MAIL_MICROSOFT_CLIENT_SECRET"] ?? process.env["MS_OAUTH_CLIENT_SECRET"];
  return id && secret ? { id, secret } : null;
}

export function oauthAvailability() {
  return {
    gmail: Boolean(oauthClient("gmail")),
    microsoft: Boolean(oauthClient("microsoft")),
  };
}

/**
 * Google et Microsoft n'acceptent que les adresses de retour déclarées dans leur
 * console. On utilise donc toujours l'origine publiée, quelle que soit l'origine
 * d'où l'utilisateur a cliqué (aperçu, localhost, domaine personnalisé).
 */
export function canonicalOrigin(origin: string): string {
  const declared = process.env["MAIL_OAUTH_ORIGIN"]?.replace(/\/+$/, "");
  if (declared) return declared;
  // Hors Lovable : l'origine publique vient de l'environnement (APP_URL/VITE_APP_URL),
  // sinon on retombe sur l'origine de la requête.
  const fromEnv = (process.env["APP_URL"] ?? process.env["VITE_APP_URL"] ?? "").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return origin.replace(/\/+$/, "");
}

export function redirectUri(origin: string): string {
  return `${canonicalOrigin(origin)}/api/public/mail/oauth/callback`;
}

/* ----------------------------- state signé ----------------------------- */

function stateKey(): string {
  const raw = process.env["MAIL_CRYPTO_KEY"];
  if (!raw) throw new Error("Configuration de chiffrement manquante côté serveur.");
  return raw;
}

export function signState(payload: {
  userId: string;
  provider: OAuthProvider;
  origin: string;
}): string {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      origin: canonicalOrigin(payload.origin),
      n: randomBytes(8).toString("hex"),
      t: Date.now(),
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): {
  userId: string;
  provider: OAuthProvider;
  origin: string;
} {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Requête de connexion invalide.");
  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new Error("Requête de connexion invalide.");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (Date.now() - Number(parsed.t) > 15 * 60 * 1000)
    throw new Error("La demande de connexion a expiré. Réessayez.");
  return { userId: parsed.userId, provider: parsed.provider, origin: parsed.origin };
}

/* ------------------------- URL de consentement ------------------------- */

export function authorizeUrl(
  provider: OAuthProvider,
  origin: string,
  state: string,
): string {
  const client = oauthClient(provider);
  if (!client)
    throw new Error(
      provider === "gmail"
        ? "La connexion Gmail n'est pas encore activée sur ce site."
        : "La connexion Outlook n'est pas encore activée sur ce site.",
    );
  if (provider === "gmail") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", client.id);
    u.searchParams.set("redirect_uri", redirectUri(origin));
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("include_granted_scopes", "true");
    u.searchParams.set("state", state);
    return u.toString();
  }
  const u = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  u.searchParams.set("client_id", client.id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", MS_SCOPES.join(" "));
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

/* --------------------------- jetons OAuth ------------------------------ */

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function tokenRequest(
  provider: OAuthProvider,
  form: Record<string, string>,
): Promise<TokenResponse> {
  const client = oauthClient(provider)!;
  const endpoint =
    provider === "gmail"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      ...form,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[mail-oauth] ${provider} token ${res.status}: ${text}`);
    throw new Error(
      "Le fournisseur a refusé la connexion. Réessayez ou reconnectez le compte.",
    );
  }
  return JSON.parse(text) as TokenResponse;
}

export function exchangeCode(
  provider: OAuthProvider,
  code: string,
  origin: string,
): Promise<TokenResponse> {
  return tokenRequest(provider, {
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin),
  });
}

export function refreshTokens(
  provider: OAuthProvider,
  refreshToken: string,
): Promise<TokenResponse> {
  return tokenRequest(provider, {
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    ...(provider === "microsoft" ? { scope: MS_SCOPES.join(" ") } : {}),
  });
}

/** Adresse et nom du titulaire du compte connecté. */
export async function fetchIdentity(
  provider: OAuthProvider,
  accessToken: string,
): Promise<{ email: string; name: string | null }> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (provider === "gmail") {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers,
    });
    if (!res.ok) throw new Error("Impossible de lire le profil Gmail.");
    const j = (await res.json()) as { emailAddress?: string };
    if (!j.emailAddress) throw new Error("Impossible de lire l'adresse Gmail.");
    return { email: j.emailAddress, name: null };
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me", { headers });
  if (!res.ok) throw new Error("Impossible de lire le profil Microsoft.");
  const j = (await res.json()) as {
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  };
  const email = j.mail ?? j.userPrincipalName;
  if (!email) throw new Error("Impossible de lire l'adresse Outlook.");
  return { email, name: j.displayName ?? null };
}

/* --------------- enregistrement / rafraîchissement en base -------------- */

type AdminDb = { from: (t: string) => any };

async function admin(): Promise<AdminDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminDb;
}

export async function saveOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  tokens: TokenResponse,
  identity: { email: string; name: string | null },
): Promise<string> {
  const db = await admin();
  const { count } = await db
    .from("email_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const expiresAt = new Date(
    Date.now() + (tokens.expires_in ?? 3600) * 1000 - 60_000,
  ).toISOString();

  const patch: Record<string, unknown> = {
    user_id: userId,
    provider,
    email: identity.email,
    display_name: identity.name,
    status: "connected",
    status_message: null,
    auth_type: "oauth",
    is_primary: (count ?? 0) === 0,
    oauth_access_token_ciphertext: encryptSecret(tokens.access_token),
    oauth_expires_at: expiresAt,
    oauth_scope: tokens.scope ?? null,
    last_sync_at: new Date().toISOString(),
  };
  if (tokens.refresh_token)
    patch["oauth_refresh_token_ciphertext"] = encryptSecret(tokens.refresh_token);

  const { data, error } = await db
    .from("email_accounts")
    .upsert(patch, { onConflict: "user_id,provider,email" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Jeton d'accès valide pour un compte OAuth (rafraîchi au besoin). */
export async function accessTokenFor(row: {
  id: string;
  provider: string;
  oauth_access_token_ciphertext: string | null;
  oauth_refresh_token_ciphertext: string | null;
  oauth_expires_at: string | null;
}): Promise<string> {
  const provider = row.provider as OAuthProvider;
  const expired =
    !row.oauth_expires_at || new Date(row.oauth_expires_at).getTime() <= Date.now();
  if (!expired && row.oauth_access_token_ciphertext)
    return decryptSecret(row.oauth_access_token_ciphertext);

  if (!row.oauth_refresh_token_ciphertext)
    throw new Error(
      "La connexion de ce compte a expiré. Reconnectez-le depuis les paramètres de messagerie.",
    );

  const tokens = await refreshTokens(
    provider,
    decryptSecret(row.oauth_refresh_token_ciphertext),
  );
  const db = await admin();
  await db
    .from("email_accounts")
    .update({
      oauth_access_token_ciphertext: encryptSecret(tokens.access_token),
      oauth_expires_at: new Date(
        Date.now() + (tokens.expires_in ?? 3600) * 1000 - 60_000,
      ).toISOString(),
      ...(tokens.refresh_token
        ? { oauth_refresh_token_ciphertext: encryptSecret(tokens.refresh_token) }
        : {}),
      status: "connected",
      status_message: null,
    })
    .eq("id", row.id);
  return tokens.access_token;
}
