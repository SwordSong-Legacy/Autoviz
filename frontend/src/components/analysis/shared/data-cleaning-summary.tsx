"use client";

import { Wrench } from "lucide-react";
import { SampleDataTable } from "./sample-data-table";

interface DataCleaningSummaryProps {
  missingMsg: string;
  rows: number;
  columns: number;
  columnNames?: string[];
  sampleData?: Record<string, unknown>[];
  /** When true, renders as a full section. When false, renders content only for modal. */
  asSection?: boolean;
  /** Optional subtitle shown above table in modal mode */
  subtitle?: string;
}

export function DataCleaningSummary({
  missingMsg,
  rows,
  columns,
  columnNames,
  sampleData,
  asSection = true,
  subtitle,
}: DataCleaningSummaryProps) {
  const hasTable = columnNames && sampleData && columnNames.length > 0;

  if (asSection) {
    return (
      <section className="border-foreground mb-6 border-[1.5px] p-6">
        <div className="mb-4 flex items-center gap-3">
          <Wrench className="text-accent h-6 w-6" />
          <h3 className="font-display text-foreground text-xl font-bold tracking-tight uppercase">
            Data Cleaning &amp; Feature Engineering
          </h3>
        </div>
        <p className="text-foreground mb-3 font-sans text-sm font-bold">{missingMsg}</p>
        <div className="mb-4 flex gap-6">
          <span className="text-muted font-sans text-sm">
            Rows: <span className="text-foreground font-bold">{rows}</span>
          </span>
          <span className="text-muted font-sans text-sm">
            Columns: <span className="text-foreground font-bold">{columns}</span>
          </span>
        </div>
        {hasTable && (
          <>
            <p className="text-muted mb-3 font-sans text-[10px] font-bold tracking-widest uppercase">
              Sample Data
            </p>
            <SampleDataTable columnNames={columnNames!} sampleData={sampleData!} variant="cyan" />
          </>
        )}
      </section>
    );
  }

  return (
    <>
      {subtitle != null && <p className="text-muted mb-4 font-mono text-xs">{subtitle}</p>}
      {hasTable ? (
        <SampleDataTable columnNames={columnNames!} sampleData={sampleData!} variant="cyan" />
      ) : null}
    </>
  );
}
