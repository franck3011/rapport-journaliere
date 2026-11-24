// Atomic, deterministic edits applied to a report draft (agent "apply_patch").
// The AI only emits operations; this module applies them so untouched content
// is preserved byte-for-byte.

export type DraftSection = { title: string; description: string; bullets: string[] };
export type Draft = { title: string; intro: string; conclusion: string; sections: DraftSection[] };

export type PatchOp =
  | { op: "set_title"; value: string }
  | { op: "set_intro"; value: string }
  | { op: "append_intro"; value: string }
  | { op: "set_conclusion"; value: string }
  | { op: "append_conclusion"; value: string }
  | { op: "add_section"; title?: string; description?: string; bullets?: string[] }
  | { op: "update_section"; index: number; title?: string; description?: string }
  | { op: "append_to_section"; index: number; text?: string; bullets?: string[] }
  | { op: "remove_section"; index: number }
  | { op: "add_bullet"; index: number; value: string }
  | { op: "update_bullet"; index: number; bullet_index: number; value: string }
  | { op: "remove_bullet"; index: number; bullet_index: number }
  | { op: "replace_text"; find: string; replace: string }
  | {
      op: "add_chart";
      index?: number;
      kind: "bar" | "line" | "pie";
      title?: string;
      data: { label: string; value: number }[];
    };

export type PatchResult = { draft: Draft; applied: string[]; skipped: string[] };

const s = (v: unknown) => (typeof v === "string" ? v : "");
const join = (a: string, b: string) => (a.trim() ? `${a.trimEnd()}\n\n${b.trim()}` : b.trim());

export function normalizeDraft(d: Partial<Draft> | undefined | null): Draft {
  return {
    title: s(d?.title),
    intro: s(d?.intro),
    conclusion: s(d?.conclusion),
    sections: (d?.sections ?? []).map((x) => ({
      title: s(x?.title),
      description: s(x?.description),
      bullets: Array.isArray(x?.bullets) ? x.bullets.map(s) : [],
    })),
  };
}

export function applyPatch(input: Partial<Draft> | undefined, ops: PatchOp[]): PatchResult {
  const d = normalizeDraft(input);
  const applied: string[] = [];
  const skipped: string[] = [];
  // Removals are applied last, highest index first, so indexes given by the AI stay valid.
  const removals: number[] = [];
  const sec = (i: number) => (Number.isInteger(i) && i >= 0 && i < d.sections.length ? d.sections[i] : null);

  for (const o of ops ?? []) {
    const any = o as any;
    switch (o.op) {
      case "set_title":
        if (s(o.value).trim()) { d.title = o.value.trim(); applied.push("Titre modifié"); } else skipped.push(o.op);
        break;
      case "set_intro": d.intro = s(o.value); applied.push("Introduction réécrite"); break;
      case "append_intro":
        if (s(o.value).trim()) { d.intro = join(d.intro, o.value); applied.push("Ajout dans l'introduction"); } else skipped.push(o.op);
        break;
      case "set_conclusion": d.conclusion = s(o.value); applied.push("Conclusion réécrite"); break;
      case "append_conclusion":
        if (s(o.value).trim()) { d.conclusion = join(d.conclusion, o.value); applied.push("Ajout dans la conclusion"); } else skipped.push(o.op);
        break;
      case "add_chart": {
      const entries = Array.isArray(o.data)
        ? o.data
            .map((point: any) => ({
              label: s(point?.label).slice(0, 60),
              value: Number(point?.value),
            }))
            .filter((point: any) => point.label && Number.isFinite(point.value))
        : [];
      if (entries.length === 0) {
        skipped.push("Graphique ignoré : aucune donnée");
        break;
      }
      const payload = {
        type: o.kind === "line" ? "line" : o.kind === "pie" ? "pie" : "bar",
        title: s(o.title),
        data: entries,
      };
      const block = "```chart\n" + JSON.stringify(payload) + "\n```";
      const target = typeof o.index === "number" ? d.sections[o.index] : undefined;
      if (target) {
        target.description = join(s(target.description), block);
      } else {
        d.sections.push({ title: s(o.title) || "Graphique", description: block, bullets: [] });
      }
      applied.push("Graphique inséré");
      break;
    }    case "add_section": {
        const ns = { title: s(o.title).trim(), description: s(o.description).trim(), bullets: (o.bullets ?? []).map(s).filter(Boolean) };
        if (!ns.title && !ns.description && !ns.bullets.length) { skipped.push(o.op); break; }
        d.sections.push(ns); // always appended: existing sections keep their photos
        applied.push(`Nouvelle partie${ns.title ? ` « ${ns.title} »` : ""}`);
        break;
      }
      case "update_section": {
        const t = sec(o.index); if (!t) { skipped.push(o.op); break; }
        if (typeof any.title === "string") t.title = any.title;
        if (typeof any.description === "string") t.description = any.description;
        applied.push(`Partie ${o.index + 1} modifiée`);
        break;
      }
      case "append_to_section": {
        const t = sec(o.index); if (!t) { skipped.push(o.op); break; }
        if (s(o.text).trim()) t.description = join(t.description, o.text!);
        for (const b of o.bullets ?? []) if (s(b).trim()) t.bullets.push(b.trim());
        applied.push(`Ajout dans la partie ${o.index + 1}`);
        break;
      }
      case "remove_section":
        if (sec(o.index) && !removals.includes(o.index)) { removals.push(o.index); applied.push(`Partie ${o.index + 1} supprimée`); } else skipped.push(o.op);
        break;
      case "add_bullet": {
        const t = sec(o.index); if (!t || !s(o.value).trim()) { skipped.push(o.op); break; }
        t.bullets.push(o.value.trim()); applied.push(`Point ajouté (partie ${o.index + 1})`);
        break;
      }
      case "update_bullet": {
        const t = sec(o.index); if (!t || t.bullets[o.bullet_index] === undefined) { skipped.push(o.op); break; }
        t.bullets[o.bullet_index] = s(o.value); applied.push(`Point modifié (partie ${o.index + 1})`);
        break;
      }
      case "remove_bullet": {
        const t = sec(o.index); if (!t || t.bullets[o.bullet_index] === undefined) { skipped.push(o.op); break; }
        t.bullets = t.bullets.filter((_, j) => j !== o.bullet_index); applied.push(`Point supprimé (partie ${o.index + 1})`);
        break;
      }
      case "replace_text": {
        const f = s(o.find);
        if (!f) { skipped.push(o.op); break; }
        let hits = 0;
        const r = (v: string) => { if (!v.includes(f)) return v; hits++; return v.split(f).join(s(o.replace)); };
        d.title = r(d.title); d.intro = r(d.intro); d.conclusion = r(d.conclusion);
        for (const x of d.sections) { x.title = r(x.title); x.description = r(x.description); x.bullets = x.bullets.map(r); }
        if (hits) applied.push(`« ${f.slice(0, 40)} » remplacé`); else skipped.push(o.op);
        break;
      }
      default:
        skipped.push(String(any?.op ?? "inconnu"));
    }
  }
  if (removals.length) d.sections = d.sections.filter((_, i) => !removals.includes(i));
  return { draft: d, applied, skipped };
}
