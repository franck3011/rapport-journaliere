/**
 * Tableaux dans les rapports.
 *
 * Convention légère : une suite de lignes commençant par « | » forme un tableau.
 *   | Colonne A | Colonne B |
 *   |---|---|
 *   | valeur | valeur |
 *
 * Aucune dépendance : le même analyseur sert à l'écran et au PDF, ce qui garantit
 * que les deux rendus montrent exactement la même chose.
 */

export type TableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type TextBlock = { type: "text"; value: string };

export type DescriptionBlock = TableBlock | TextBlock;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\|?[\s:-]*-[\s|:-]*$/.test(line.trim()) && line.includes("-");
}

/** Découpe une description en blocs texte et tableaux. */
export function parseDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  const lines = (text ?? "").split(/\r?\n/);
  let buffer: string[] = [];

  const flushText = () => {
    const value = buffer.join("\n").trim();
    if (value) blocks.push({ type: "text", value });
    buffer = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const isTableLine = line.trim().startsWith("|") && line.trim().endsWith("|");

    if (!isTableLine) {
      buffer.push(line);
      continue;
    }

    flushText();

    // Une suite de lignes de tableau : en-tête, séparateur éventuel, puis corps.
    const rows: string[][] = [];
    let headers: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim().startsWith("|") &&
      lines[index].trim().endsWith("|")
    ) {
      const current = lines[index].trim();
      if (isSeparator(current)) {
        index++;
        continue;
      }
      const cells = splitRow(current);
      if (headers.length === 0) headers = cells;
      else rows.push(cells);
      index++;
    }
    index--;

    if (headers.length > 0) blocks.push({ type: "table", headers, rows });
  }

  flushText();
  return blocks;
}

/** Largeurs relatives des colonnes, pour un rendu PDF équilibré. */
export function columnWidths(headers: string[], rows: string[][]): number[] {
  const count = headers.length;
  const weights = headers.map((header, index) => {
    const lengths = [header.length, ...rows.map((row) => (row[index] ?? "").length)];
    return Math.min(60, Math.max(8, Math.max(...lengths)));
  });
  const total = weights.reduce((sum, value) => sum + value, 0) || count;
  return weights.map((value) => value / total);
}
