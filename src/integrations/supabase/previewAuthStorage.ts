// Stockage de session Supabase : localStorage standard.
//
// Ce fichier contenait un « broker » postMessage qui synchronisait la session
// avec l'éditeur Lovable dans les aperçus. Ce mécanisme est inutile (et nuisible)
// hors Lovable : on garde exactement la même API publique, mais adossée au
// localStorage du navigateur.

export interface PreviewAuthStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

/**
 * Renvoie le stockage à utiliser pour la session Supabase.
 * `undefined` en SSR ou si le localStorage est inaccessible (navigation privée,
 * quota atteint) : Supabase bascule alors sur son stockage mémoire par défaut.
 */
export function brokeredPreviewStorage(): PreviewAuthStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const probe = "__dailybrief_storage_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    };
  } catch {
    return undefined;
  }
}
