/**
 * URL publique de l'application.
 *
 * Ordre de résolution :
 *   1. `VITE_APP_URL` (inlinée par Vite au build) ou `APP_URL` (lue à l'exécution) ;
 *   2. l'origine du navigateur (côté client) ;
 *   3. le domaine de production (côté serveur, si la variable manque).
 *
 * Les replis évitent qu'une variable d'environnement oubliée casse les
 * métadonnées Open Graph ou les redirections OAuth.
 */
const PRODUCTION_URL = "https://rapport-journaliere.vercel.app";

export function appUrl(): string {
  let fromVite = "";
  try {
    fromVite = (import.meta.env.VITE_APP_URL as string | undefined) ?? "";
  } catch {
    fromVite = "";
  }

  let fromNode = "";
  if (typeof process !== "undefined" && process.env) {
    fromNode = process.env.APP_URL ?? process.env.VITE_APP_URL ?? "";
  }

  const raw = (fromNode || fromVite).trim();
  if (raw) return raw.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return PRODUCTION_URL;
}

/** URL absolue d'un asset public (ex. image Open Graph). */
export function appAssetUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${appUrl()}${clean}`;
}
