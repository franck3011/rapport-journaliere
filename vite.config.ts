// Configuration de build.
//
// Le wrapper `@lovable.dev/vite-tanstack-config` apporte : TanStack Start,
// viteReact, tailwindcss, tsConfigPaths, nitro (cible Vercel/Cloudflare),
// l'injection des variables VITE_*, l'alias @, la déduplication React/TanStack
// et les plugins de journalisation d'erreurs.
//
// Le plugin MCP de Lovable n'est volontairement PAS inclus : il n'a de sens
// que dans l'éditeur Lovable, et l'application est déployée hors de celui-ci.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
