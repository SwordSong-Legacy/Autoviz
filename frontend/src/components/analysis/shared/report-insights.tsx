"use client";

import { useMemo } from "react";
import type { ReportDetail, ReportResponse } from "@/lib/api/conversations";
import { useLang } from "@/hooks";

function toDetail(d: ReportDetail): { text: string; vizRefs: number[] } {
  return { text: d.text, vizRefs: d.viz_refs ?? [] };
}

/** Deduplicate viz refs: each image shown only on first reference across the report. */
function buildFindingsWithDedupedViz(
  keyFindings: ReportResponse["key_findings"]
): { theme: string; summary: string; details: { text: string; vizRefsToShow: number[] }[] }[] {
  const shownViz = new Set<number>();
  return keyFindings.map((kf) => ({
    theme: kf.theme,
    summary: kf.summary,
    details: (kf.details ?? []).map((d) => {
      const { text, vizRefs } = toDetail(d);
      const vizRefsToShow = vizRefs.filter((idx) => {
        if (shownViz.has(idx)) return false;
        shownViz.add(idx);
        return true;
      });
      return { text, vizRefsToShow };
    }),
  }));
}

export interface ReportInsightsProps {
  report: ReportResponse;
  charts?: { src: string; title: string }[];
}

/** Renders report with images above insights when viz_refs are present. Each image appears only once. */
export function ReportInsights({ report, charts = [] }: ReportInsightsProps) {
  const { t } = useLang();
  const tr = t.report;
  const findingsWithDedupedViz = useMemo(
    () => buildFindingsWithDedupedViz(report.key_findings),
    [report.key_findings]
  );

  return (
    <>
      <h3 className="font-display text-foreground mb-4 text-xl font-bold tracking-tight uppercase">
        {tr.keyInsights}
      </h3>
      <div className="text-foreground space-y-4 font-sans text-sm leading-relaxed">
        <div>
          <h4 className="text-muted mb-2 font-sans text-[10px] font-bold tracking-widest uppercase">
            {tr.datasetOverview}
          </h4>
          <p>{report.dataset_overview}</p>
        </div>
        <div>
          <h4 className="text-muted mb-2 font-sans text-[10px] font-bold tracking-widest uppercase">
            {tr.keyFindings}
          </h4>
          <ul className="list-disc space-y-4 pl-5">
            {findingsWithDedupedViz.map((kf) => (
              <li key={kf.theme} className="space-y-2">
                <span className="text-accent font-bold">{kf.theme}:</span> {kf.summary}
                {kf.details.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-3 pl-5">
                    {kf.details.map((d, i) => (
                      <li key={i} className="space-y-2">
                        {d.vizRefsToShow.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-2 py-2">
                            {d.vizRefsToShow.map((idx) => {
                              const chart = charts[idx - 1];
                              if (!chart?.src) return null;
                              return (
                                <img
                                  key={idx}
                                  src={chart.src}
                                  alt={chart.title}
                                  className="max-h-48 max-w-full object-contain"
                                  loading="lazy"
                                  decoding="async"
                                />
                              );
                            })}
                          </div>
                        )}
                        {d.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        {report.relationship_analysis.length > 0 && (
          <div>
            <h4 className="text-muted mb-2 font-sans text-[10px] font-bold tracking-widest uppercase">
              {tr.relationshipAnalysis}
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              {report.relationship_analysis.map((ra, i) => (
                <li key={i}>
                  <span className="text-foreground font-bold">{ra.variables.join(", ")}</span>:{" "}
                  {ra.description}
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.suggestions.length > 0 && (
          <div>
            <h4 className="text-muted mb-2 font-sans text-[10px] font-bold tracking-widest uppercase">
              {tr.suggestions}
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              {report.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
