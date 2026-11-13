/**
 * Export CSV compatible Excel (séparateur « ; » et BOM UTF-8 pour les accents).
 * Aucune dépendance : le fichier s'ouvre directement dans Excel ou LibreOffice.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): void {
  const escape = (value: unknown): string => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const content = [headers, ...rows]
    .map((line) => line.map(escape).join(";"))
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Suffixe de date pour les noms de fichiers : 2026-11-13. */
export function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
