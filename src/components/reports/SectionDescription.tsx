import { parseDescription } from "@/lib/table-block";

/**
 * Rendu d'une description de section : paragraphes de texte et tableaux.
 * Les tableaux sont lus depuis la convention « | colonne | colonne | ».
 */
export function SectionDescription({ text }: { text: string }) {
  const blocks = parseDescription(text);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <div key={index} className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {block.value}
            </div>
          );
        }

        return (
          <div key={index} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th
                      key={headerIndex}
                      className="border border-border/60 bg-primary/10 px-3 py-2 text-left font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 1 ? "bg-muted/40" : undefined}>
                    {block.headers.map((_, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border border-border/60 px-3 py-2 align-top"
                      >
                        {row[cellIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
