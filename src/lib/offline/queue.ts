/**
 * File d'attente locale des rapports non envoyés.
 *
 * Utilisée quand l'enregistrement échoue faute de réseau : le rapport est
 * conservé dans le navigateur puis renvoyé automatiquement au retour de la
 * connexion. Stockage volontairement simple (localStorage) : les rapports en
 * attente sont petits, et cela survit à un rechargement de page.
 */

const KEY = "dailybrief:offline-reports";

export type QueuedReport = {
  payload: any;
  at: string;
  label: string;
};

export function listQueued(): QueuedReport[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedReport[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-20)));
  } catch {
    // quota dépassé : on ignore, l'utilisateur verra le message d'erreur initial
  }
}

export function enqueueReport(payload: any): void {
  const items = listQueued();
  items.push({
    payload,
    at: new Date().toISOString(),
    label: String(payload?.title ?? "Rapport sans titre"),
  });
  write(items);
}

export function removeQueued(index: number): void {
  const items = listQueued();
  items.splice(index, 1);
  write(items);
}

export function clearQueued(): void {
  write([]);
}

/** Une erreur réseau (et non une erreur métier renvoyée par le serveur). */
export function isOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|offline/i.test(
    message,
  );
}
