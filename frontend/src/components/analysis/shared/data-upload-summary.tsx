"use client";

import { CheckCircle2 } from "lucide-react";
import { SampleDataTable } from "./sample-data-table";
import { useLang } from "@/hooks";

interface DataUploadSummaryProps {
  rows: number;
  columns: number;
  columnNames: string[];
  sampleData: Record<string, unknown>[];
  /** When true, renders as a full section with icon and title. When false, renders content only for modal. */
  asSection?: boolean;
  /** Optional subtitle (e.g. "dataset — 100 rows, 5 columns") shown above table in modal mode */
  subtitle?: string;
}

export function DataUploadSummary({
  rows,
  columns,
  columnNames,
  sampleData,
  asSection = true,
  subtitle,
}: DataUploadSummaryProps) {
  const { t } = useLang();
  const tu = t.upload;

  if (asSection) {
    return (
      <section className="border-foreground mb-6 border-[1.5px] p-6">
        <div className="mb-4 flex items-center gap-3">
          <CheckCircle2 className="text-accent h-6 w-6" />
          <h3 className="font-display text-foreground text-xl font-bold tracking-tight uppercase">
            {tu.title}
          </h3>
        </div>
        <div className="mb-4 flex gap-6">
          <span className="text-muted font-sans text-sm">
            {tu.rowsLabel + " "}
            <span className="text-foreground font-bold">{rows}</span>
          </span>
          <span className="text-muted font-sans text-sm">
            {tu.columnsLabel + " "}
            <span className="text-foreground font-bold">{columns}</span>
          </span>
        </div>
        <p className="text-muted mb-3 font-sans text-[10px] font-bold tracking-widest uppercase">
          {tu.sampleData}
        </p>
        <SampleDataTable columnNames={columnNames} sampleData={sampleData} variant="emerald" />
      </section>
    );
  }

  return (
    <>
      {subtitle != null && <p className="text-muted mb-4 font-mono text-xs">{subtitle}</p>}
      <SampleDataTable columnNames={columnNames} sampleData={sampleData} variant="emerald" />
    </>
  );
}
