/**
 * Blocs visuels des rapports.
 *
 * En plus des tableaux markdown, une section peut contenir des blocs ::
 *
 *   ```chart
 *   { "type": "bar", "title": "Matériel par service",
 *     "data": [{ "label": "Compta", "value": 12 }, { "label": "Technique", "value": 8 }] }
 *   ```
 *
 * Types acceptés : bar, line, pie. Aucune dépendance ici : l'analyse est faite
 * une fois pour toutes, l'écran et le PDF consomment le même résultat.
 */

export type ChartKind = "bar" | "line" | "pie";

export type ChartBlock = {
  type: "chart";
  kind: ChartKind;
  title: string;
  data: { label: string; value: number }[];
};

export type TableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type TextBlock = { type: "text"; value: string };

export type DescriptionBlock = TableBlock | ChartBlock | TextBlock;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\|?[\s:-]*-[\s|:-]*$/.test(line.trim()) && line.includes("-");
}

function parseChart(json: string): ChartBlock | null {
  try {
    const parsed = JSON.parse(json);
    const kind: ChartKind =
      parsed?.type === "line" ? "line" : parsed?.type === "pie" ? "pie" : "bar";
    const data = Array.isArray(parsed?.data)
      ? parsed.data
          .map((entry: any) => ({
            label: String(entry?.label ?? entry?.name ?? "").slice(0, 60),
            value: Number(entry?.value ?? 0),
          }))
          .filter((entry: any) => entry.label && Number.isFinite(entry.value))
      : [];
    if (data.length === 0) return null;
    return { type: "chart", kind, title: String(parsed?.title ?? ""), data };
  } catch {
    return null;
  }
}

/** Découpe une description en blocs texte, tableaux et graphiques. */
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
    const trimmed = line.trim();

    // Bloc graphique
    if (trimmed.startsWith("```chart")) {
      const body: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        body.push(lines[index]);
        index++;
      }
      const chart = parseChart(body.join("\n"));
      if (chart) {
        flushText();
        blocks.push(chart);
      } else {
        buffer.push(...body);
      }
      continue;
    }

    const isTableLine = trimmed.startsWith("|") && trimmed.endsWith("|");
    if (!isTableLine) {
      buffer.push(line);
      continue;
    }

    flushText();

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
