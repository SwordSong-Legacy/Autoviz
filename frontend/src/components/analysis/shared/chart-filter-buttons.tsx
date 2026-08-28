"use client";

import { useLang } from "@/hooks";

// Keep exported for backward compat (barrel re-exports it)
export const CHART_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "bar", label: "Bar" },
  { value: "bar-line", label: "Bar-Line" },
  { value: "pie", label: "Pie" },
  { value: "line", label: "Line" },
  { value: "scatter", label: "Scatter" },
  { value: "heatmap", label: "Heatmap" },
] as const;

const CHART_TYPE_CATEGORIES = CHART_CATEGORIES.slice(1); // bar, bar-line, pie, etc. (no "all")

interface ChartFilterButtonsProps {
  charts: { type?: string }[];
  chartFilter: string;
  onFilterChange: (value: string) => void;
  /** Optional label before buttons (e.g. "5 charts generated") */
  countLabel?: string;
}

export function ChartFilterButtons({
  charts,
  chartFilter,
  onFilterChange,
  countLabel,
}: ChartFilterButtonsProps) {
  const { t } = useLang();
  const types = new Set(charts.map((c) => c.type ?? "chart"));
  const availableCategories = [
    { value: "all", label: t.charts.filterAll },
    ...CHART_TYPE_CATEGORIES.filter((cat) => types.has(cat.value)),
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {countLabel != null && countLabel !== "" && (
        <p className="text-muted mr-2 font-mono text-[10px]">{countLabel}</p>
      )}
      {availableCategories.map((cat) => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onFilterChange(cat.value)}
          className={`px-3 py-1.5 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors ${
            chartFilter === cat.value
              ? "bg-foreground text-background"
              : "border-border bg-background text-muted hover:border-foreground hover:text-foreground border"
          }`}
        >
          {cat.label}
          {cat.value !== "all" && (
            <span className="ml-1 opacity-60">
              ({charts.filter((c) => (c.type ?? "chart") === cat.value).length})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
