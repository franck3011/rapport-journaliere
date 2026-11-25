import { createFileRoute } from "@tanstack/react-router";

/**
 * Point de contrôle du déploiement.
 *
 * Vercel expose le commit déployé dans VERCEL_GIT_COMMIT_SHA. Cette route
 * permet de vérifier, depuis l'extérieur, QUELLE version est réellement en
 * ligne — sans accès au tableau de bord.
 *
 *   GET /api/version  →  { "commit": "b19b2c3", "env": "production" }
 */
export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () => {
        const commit =
          process.env.VERCEL_GIT_COMMIT_SHA ??
          process.env.GIT_COMMIT_SHA ??
          "inconnu";

        return new Response(
          JSON.stringify(
            {
              commit: commit.slice(0, 7),
              full: commit,
              env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "inconnu",
              branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
              deployedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});
