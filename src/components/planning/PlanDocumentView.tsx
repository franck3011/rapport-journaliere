import type { PlanSection } from "@/lib/planning/plan-documents.functions";

export function PlanDocumentView({
  title,
  intro,
  conclusion,
  sections,
  periodLabel,
  companyName,
}: {
  title: string;
  intro: string;
  conclusion: string;
  sections: PlanSection[];
  periodLabel: string;
  companyName?: string;
}) {
  return (
    <article className="mx-auto max-w-[70ch] rounded-xl border bg-white px-8 py-10 text-foreground shadow-sm dark:bg-card">
      <header className="border-b pb-4">
        {companyName && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {companyName}
          </p>
        )}
        <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {periodLabel}
        </p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight">{title || "(sans titre)"}</h1>
      </header>

      {intro && (
        <p className="mt-6 whitespace-pre-wrap text-[15px] leading-[1.75]">{intro}</p>
      )}

      {sections.map((section, index) => (
        <section key={index} className="mt-7">
          {section.title && (
            <h2 className="border-b pb-1 text-[15px] font-semibold uppercase tracking-wide">
              {section.title}
            </h2>
          )}
          {section.description && (
            <p className="mt-2 text-[13px] text-muted-foreground">{section.description}</p>
          )}
          {section.bullets.filter((b) => b.trim()).length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {section.bullets
                .filter((b) => b.trim())
                .map((bullet, bulletIndex) => (
                  <li key={bulletIndex} className="flex gap-2.5 text-[15px] leading-[1.7]">
                    <span className="mt-[2px] text-muted-foreground">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}

      {conclusion && (
        <p className="mt-8 border-t pt-4 whitespace-pre-wrap text-[15px] leading-[1.75]">
          {conclusion}
        </p>
      )}
    </article>
  );
}
