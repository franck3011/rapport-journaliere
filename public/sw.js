/* Service worker DailyBrief.
 *
 * Stratégie choisie pour ne JAMAIS servir une version périmée de l'application :
 *  - navigation (pages) : réseau d'abord, cache seulement en cas de coupure ;
 *  - fichiers /assets/ (noms hachés) : cache d'abord, ils ne changent jamais ;
 *  - requêtes non-GET (enregistrements) : jamais interceptées, toujours réseau
 *    (la file d'attente hors-ligne de l'application prend le relais).
 */
const VERSION = "v2";
const CACHE = `dailybrief-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Fichiers statiques hachés : immuables, on peut les servir depuis le cache.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
    return;
  }

  // Pages : le réseau fait foi ; le cache ne sert qu'en cas de coupure.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const root = await caches.match("/");
          if (root) return root;
          return new Response(
            "<!doctype html><meta charset='utf-8'><title>Hors connexion</title><body style=\"font-family:system-ui;padding:40px;text-align:center\"><h1>Hors connexion</h1><p>Cette page n'a pas encore été visitée. Reconnectez-vous et réessayez.</p></body>",
            { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});
