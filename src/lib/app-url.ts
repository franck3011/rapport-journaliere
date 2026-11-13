/**
 * URL publique de l'application.
 *
 * Plus aucune dépendance à un domaine Lovable : tout passe par une variable
 * d'environnement, ce qui permet de déployer sur n'importe quel hébergeur
 * (Vercel, Cloudflare, Netlify…) ou avec un domaine personnalisé.
 *
 * - Côté client : `VITE_APP_URL` (inlinée par Vite au build).
 * - Côté serveur : `APP_URL` (lue à l'exécution), avec repli sur `VITE_APP_URL`.
 */
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
  return (raw || "http://localhost:8080").replace(/\/+$/, "");
}

/** URL absolue d'un asset public (ex. image Open Graph). */
export function appAssetUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${appUrl()}${clean}`;
}
