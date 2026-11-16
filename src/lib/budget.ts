// Calculs et formatage pour les documents financiers (budget, devis, proforma…)

export type DocType = "report" | "plan" | "budget" | "quote" | "proforma" | "invoice";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  report: "Rapport",
  plan: "Planning",
  budget: "Budget",
  quote: "Devis",
  proforma: "Facture proforma",
  invoice: "Facture",
};

export const DOC_TYPE_PREFIX: Record<DocType, string> = {
  report: "RAP",
  plan: "PLN",
  budget: "BUD",
  quote: "DEV",
  proforma: "PRO",
  invoice: "FAC",
};

export type BudgetLine = {
  id?: string;
  category: string;
  label: string;
  unit: string;
  quantity: number;
  unit_price: number;
  planned_amount: number;
  actual_amount: number;
  notes: string;
  position: number;
};

export type CurrencyOption = { code: string; label: string; symbol: string; decimals: number };

export const CURRENCIES: CurrencyOption[] = [
  { code: "XOF", label: "Franc CFA (FCFA)", symbol: "FCFA", decimals: 0 },
  { code: "EUR", label: "Euro (€)", symbol: "€", decimals: 2 },
  { code: "USD", label: "Dollar US ($)", symbol: "$", decimals: 2 },
  { code: "GHS", label: "Cedi ghanéen (GH₵)", symbol: "GH₵", decimals: 2 },
  { code: "MAD", label: "Dirham marocain (DH)", symbol: "DH", decimals: 2 },
  { code: "NGN", label: "Naira (₦)", symbol: "₦", decimals: 2 },
];

export const TAX_RATE_PRESETS = [0, 9, 18, 20];

export function currencyOf(code: string): CurrencyOption {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function formatAmount(value: number, code: string): string {
  const c = currencyOf(code);
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = safe.toLocaleString("fr-FR", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  });
  return `${formatted} ${c.symbol}`;
}

/** Montant prévu effectif : la saisie manuelle prime, sinon Qté × PU. */
export function linePlanned(line: Pick<BudgetLine, "quantity" | "unit_price" | "planned_amount">): number {
  if (line.planned_amount && Number(line.planned_amount) !== 0) return Number(line.planned_amount);
  return round2(Number(line.quantity || 0) * Number(line.unit_price || 0));
}

export function lineVariance(line: BudgetLine): number {
  return round2(linePlanned(line) - Number(line.actual_amount || 0));
}

export function lineExecutionRate(line: BudgetLine): number | null {
  const planned = linePlanned(line);
  if (!planned) return null;
  return round2((Number(line.actual_amount || 0) / planned) * 100);
}

export type BudgetTotals = {
  planned: number;
  actual: number;
  variance: number;
  executionRate: number | null;
  taxAmount: number;
  totalWithTax: number;
};

export function budgetTotals(lines: BudgetLine[], taxRate: number): BudgetTotals {
  const planned = round2(lines.reduce((s, l) => s + linePlanned(l), 0));
  const actual = round2(lines.reduce((s, l) => s + Number(l.actual_amount || 0), 0));
  const rate = Number(taxRate || 0);
  const taxAmount = round2((planned * rate) / 100);
  return {
    planned,
    actual,
    variance: round2(planned - actual),
    executionRate: planned ? round2((actual / planned) * 100) : null,
    taxAmount,
    totalWithTax: round2(planned + taxAmount),
  };
}

export type BudgetGroup = {
  category: string;
  lines: BudgetLine[];
  planned: number;
  actual: number;
  variance: number;
};

export function groupBudgetLines(lines: BudgetLine[]): BudgetGroup[] {
  const order: string[] = [];
  const map = new Map<string, BudgetLine[]>();
  for (const l of [...lines].sort((a, b) => a.position - b.position)) {
    const key = (l.category || "").trim() || "Sans catégorie";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(l);
  }
  return order.map((category) => {
    const grouped = map.get(category)!;
    const planned = round2(grouped.reduce((s, l) => s + linePlanned(l), 0));
    const actual = round2(grouped.reduce((s, l) => s + Number(l.actual_amount || 0), 0));
    return { category, lines: grouped, planned, actual, variance: round2(planned - actual) };
  });
}

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function buildDocNumber(docType: DocType, year: number, seq: number): string {
  return `${DOC_TYPE_PREFIX[docType]}-${year}-${String(seq).padStart(4, "0")}`;
}
