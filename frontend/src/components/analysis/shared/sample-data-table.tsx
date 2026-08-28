"use client";

export type TableVariant = "emerald" | "cyan";

interface SampleDataTableProps {
  columnNames: string[];
  sampleData: Record<string, unknown>[];
  variant: TableVariant;
}

const variantClasses = {
  emerald: {
    wrapper: "border-border",
    thead: "border-border bg-surface",
    th: "text-muted",
    tbody: "bg-background",
    tr: "border-border hover:bg-secondary",
    trAlt: "",
    td: "text-foreground",
  },
  cyan: {
    wrapper: "border-border",
    thead: "border-border bg-surface",
    th: "text-muted",
    tbody: "bg-background",
    tr: "border-border hover:bg-secondary",
    trAlt: "bg-surface",
    td: "text-foreground",
  },
};

export function SampleDataTable({ columnNames, sampleData, variant }: SampleDataTableProps) {
  const c = variantClasses[variant];
  const useAlternatingRows = variant === "cyan";

  return (
    <div className={`scrollbar-table overflow-x-auto border ${c.wrapper}`}>
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className={`border-b ${c.thead}`}>
            {columnNames.map((col) => (
              <th
                key={col}
                className={`px-3 py-2.5 text-left font-mono text-[10px] tracking-widest whitespace-nowrap uppercase ${c.th}`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={c.tbody}>
          {sampleData.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b transition-colors last:border-b-0 ${
                useAlternatingRows && ri % 2 === 1 ? c.trAlt : ""
              } ${c.tr}`}
            >
              {columnNames.map((col) => {
                const val = row[col];
                const isDesc = col === "description";
                return (
                  <td
                    key={col}
                    className={
                      isDesc
                        ? `max-w-xs truncate px-3 py-2 font-sans text-xs ${c.td}`
                        : `px-3 py-2 font-sans text-xs whitespace-nowrap ${c.td}`
                    }
                    title={isDesc && typeof val === "string" ? val : undefined}
                  >
                    {String(val ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
