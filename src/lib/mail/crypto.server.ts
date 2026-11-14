import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des secrets de messagerie (mots de passe IMAP, jetons).
 * La clé vient de MAIL_CRYPTO_KEY (secret serveur) — jamais exposée au client.
 */
function key(): Buffer {
  const raw = process.env["MAIL_CRYPTO_KEY"];
  if (!raw) throw new Error("Configuration de chiffrement manquante côté serveur.");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(stored: string): string {
  try {
    const buf = Buffer.from(stored, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // Cas typique : la clé MAIL_CRYPTO_KEY a changé depuis l'enregistrement du compte.
    // Le message brut d'OpenSSL n'aide pas l'utilisateur, on explique l'action à faire.
    throw new Error(
      "Ce compte doit être reconnecté : ses jetons ne sont plus déchiffrables. Supprimez-le puis rajoutez-le depuis les paramètres de messagerie.",
    );
  }
}
