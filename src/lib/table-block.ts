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

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return Number(cleaned);
}
function parseChart(json: string): ChartBlock | null {
  try {
    const parsed = JSON.parse(json);
    const kind: ChartKind =
      parsed?.type === "line" ? "line" : parsed?.type === "pie" ? "pie" : "bar";

    // Notre format : { data: [{ label, value }] }
    let data: { label: string; value: number }[] = Array.isArray(parsed?.data)
      ? parsed.data
          .filter((entry: any) => entry && typeof entry === "object" && "label" in entry)
          .map((entry: any) => ({
            label: String(entry.label ?? "").slice(0, 60),
            value: toNumber(entry.value),
          }))
      : [];

    // Format Chart.js : { data: { labels: [...], datasets: [{ data: [...] }] } }
    if (data.length === 0 && Array.isArray(parsed?.data?.labels)) {
      const labels = parsed.data.labels;
      const series = Array.isArray(parsed.data.datasets) ? parsed.data.datasets[0] : null;
      const values = Array.isArray(series?.data) ? series.data : [];
      data = labels.map((label: any, index: number) => ({
        label: String(label ?? "").slice(0, 60),
        value: toNumber(values[index]),
      }));
    }

    data = data.filter((entry) => entry.label && Number.isFinite(entry.value));
    if (data.length === 0) return null;

    const title = String(parsed?.title ?? parsed?.options?.plugins?.title?.text ?? "");
    return { type: "chart", kind, title, data };
  } catch {
    return null;
  }
}

/** Extrait le premier objet JSON équilibré d'un texte (JSON écrit sans balise). */
function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
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
    if (trimmed.startsWith("```")) {
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

  // Repli : graphique ecrit en JSON brut (sans balise), format Chart.js ou notre format.
  if (!blocks.some((block) => block.type === "chart")) {
    const json = extractFirstJson(text);
    const chart = json ? parseChart(json) : null;
    if (chart) {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.type !== "text") continue;
        const cleaned = block.value.replace(json as string, "").trim();
        if (cleaned) blocks[i] = { type: "text", value: cleaned };
        else blocks.splice(i, 1), i--;
      }
      blocks.push(chart);
    }
  }

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
