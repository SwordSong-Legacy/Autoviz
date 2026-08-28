"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Upload,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import type { ReportResponse, VisualizationItem } from "@/lib/api/conversations";
import { getImageUrl } from "@/lib/api-client";
import { useLang } from "@/hooks/use-lang";
import {
  chartFromVisualizationItem,
  issueFromVisualizationItem,
  type VizPipelineIssue,
} from "@/lib/viz-critic";
import {
  DataUploadSummary,
  DataCleaningSummary,
  ChartThumbnail,
  ChartFilterButtons,
  ReportInsights,
  VizPipelineIssuesPanel,
} from "@/components/analysis/shared";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isConversationId(id: string): boolean {
  return UUID_REGEX.test(id);
}

/** Extract sample table from CSV summary. Prefers structured sample_data when available. */
function getSampleTableFromCsv(csv: {
  sample_rows?: string;
  sample_data?: Array<Record<string, string | number | boolean | null>>;
  column_types?: Record<string, string>;
}): { columnNames: string[]; sampleData: Record<string, unknown>[] } {
  const columnNames = Object.keys(csv.column_types ?? {});
  if (!columnNames.length) return { columnNames, sampleData: [] };

  const structured = csv.sample_data;
  if (structured?.length) {
    return { columnNames, sampleData: structured as Record<string, unknown>[] };
  }

  const sampleRows = csv.sample_rows ?? "";
  if (!sampleRows.trim()) return { columnNames, sampleData: [] };
  const lines = sampleRows.trim().split("\n");
  if (lines.length < 2) return { columnNames, sampleData: [] };

  const sampleData: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s{2,}/);
    const row: Record<string, unknown> = {};
    columnNames.forEach((col, idx) => {
      row[col] = parts[idx] ?? "";
    });
    sampleData.push(row);
  }
  return { columnNames, sampleData };
}

function reportToReactNode(
  report: ReportResponse,
  charts: { src: string; title: string }[] = []
): React.ReactNode {
  return <ReportInsights report={report} charts={charts} />;
}

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

interface AnalysisConfig {
  fileName: string;
  upload: {
    rows: number;
    columns: number;
    columnNames: string[];
    sampleData: Record<string, unknown>[];
  };
  cleaning: {
    missingMsg: string;
    rows: number;
    columns: number;
    columnNames?: string[];
    sampleData?: Record<string, unknown>[];
  };
  charts: { src: string; title: string; type: string; annotation?: string; criticHint?: string }[];
  vizIssues: VizPipelineIssue[];
  insights: React.ReactNode;
  insightsMarkdown: string;
}

/* ------------------------------------------------------------------ */
/*  ProcessingSteps                                                    */
/* ------------------------------------------------------------------ */

export function ProcessingSteps({ analysisId }: { analysisId?: string | null }) {
  const [apiConfig, setApiConfig] = useState<AnalysisConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [chartFilter, setChartFilter] = useState<string>("all");
  const [isInsightsGenerating, setIsInsightsGenerating] = useState(false);
  const { t, lang } = useLang();
  const [showInsightsSummary, setShowInsightsSummary] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  const config = apiConfig;

  useEffect(() => {
    if (!analysisId || !isConversationId(analysisId)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      conversationsApi.getCsvContext(analysisId).catch(() => null),
      conversationsApi.listVisualizations(analysisId).catch(() => []),
      conversationsApi.getReport(analysisId).catch(() => null),
    ])
      .then(([csvRes, vizList, reportRes]) => {
        if (cancelled) return;
        const csv = csvRes?.csv_summary;
        if (!csv) {
          setError(t.chat.analysisInProgress);
          setApiConfig(null);
          return;
        }
        const { columnNames, sampleData } = getSampleTableFromCsv(csv);
        const doneViz = (vizList as VisualizationItem[]).filter((v) => v.status === "done");
        const charts = doneViz
          .map((v) =>
            v.image_url ? chartFromVisualizationItem(v, getImageUrl(v.image_url)) : null
          )
          .filter((c): c is NonNullable<typeof c> => c != null);
        const vizIssues = (vizList as VisualizationItem[])
          .map(issueFromVisualizationItem)
          .filter((x): x is VizPipelineIssue => x != null);
        const fileName = columnNames.length ? t.analysis.datasetName : t.analysis.dataName;
        setApiConfig({
          fileName,
          upload: {
            rows: csv.row_count ?? 0,
            columns: csv.column_count ?? 0,
            columnNames,
            sampleData,
          },
          cleaning: {
            missingMsg: csv.missing_values_handled || t.analysis.noMissingValues,
            rows: csv.row_count ?? 0,
            columns: csv.column_count ?? 0,
            columnNames,
            sampleData,
          },
          charts,
          vizIssues,
          insights: reportRes ? reportToReactNode(reportRes, charts) : <></>,
          insightsMarkdown: "", // Export uses backend; no frontend markdown needed
        });
        setReport(reportRes ?? null);
        setShowInsightsSummary(!!reportRes);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t.analysis.failedToLoad);
          setApiConfig(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, t]);

  const handleGenerateInsights = useCallback(async () => {
    if (!analysisId || !isConversationId(analysisId)) return;
    setIsInsightsGenerating(true);
    setShowInsightsSummary(false);
    try {
      const reportRes = await conversationsApi.generateReport(analysisId, lang);
      setReport(reportRes);
      setApiConfig((prev) =>
        prev
          ? {
              ...prev,
              insights: reportToReactNode(reportRes, prev.charts),
              insightsMarkdown: "",
            }
          : prev
      );
      setShowInsightsSummary(true);
    } catch {
      setShowInsightsSummary(false);
    } finally {
      setIsInsightsGenerating(false);
    }
  }, [analysisId, lang]);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [downloadMenuOpen]);

  const handleExport = useCallback(
    async (format: "pdf" | "docx" | "md") => {
      if (!analysisId || !isConversationId(analysisId)) return;
      setExportLoading(format);
      setDownloadMenuOpen(false);
      try {
        await conversationsApi.exportReport(analysisId, format);
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        setExportLoading(null);
      }
    },
    [analysisId]
  );

  const charts = config?.charts ?? [];

  const filteredCharts = useMemo(
    () => (chartFilter === "all" ? charts : charts.filter((c) => c.type === chartFilter)),
    [charts, chartFilter]
  );

  if (loading && analysisId && isConversationId(analysisId as string)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-24">
        <Loader2 className="text-accent h-8 w-8 animate-spin" />
        <p className="text-muted font-mono text-xs tracking-widest uppercase">
          {t.chat.loadingAnalysis}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-sm text-amber-400">{error}</p>
      </div>
    );
  }

  return (
    <div
      className={`bg-background flex min-h-full w-full flex-col ${config ? "items-start justify-start" : "items-center justify-center"}`}
    >
      {/* Lightbox: enlarged image + description sidebar */}
      {lightboxIndex !== null && (
        <>
          <div
            className="bg-foreground/90 fixed inset-0 z-50"
            onClick={() => setLightboxIndex(null)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-4 z-50 flex items-center justify-center gap-2 sm:inset-6"
            onClick={(e) => e.stopPropagation()}
          >
            {filteredCharts.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (lightboxIndex !== null)
                    setLightboxIndex(
                      lightboxIndex > 0 ? lightboxIndex - 1 : filteredCharts.length - 1
                    );
                }}
                className="text-background hover:bg-foreground/60 shrink-0 p-2 transition-colors"
                aria-label={t.chat.previous}
              >
                <ChevronLeft className="h-10 w-10" />
              </button>
            )}

            {lightboxIndex !== null &&
              lightboxIndex < filteredCharts.length &&
              (() => {
                const currentChart = filteredCharts[lightboxIndex];
                return (
                  <div className="flex max-h-[90vh] max-w-full min-w-0 flex-1 items-stretch gap-4">
                    <div className="relative flex min-w-0 flex-1 items-center justify-center">
                      <img
                        src={currentChart.src}
                        alt={currentChart.title}
                        className="max-h-[88vh] max-w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          const ph = (e.target as HTMLImageElement).nextElementSibling;
                          if (ph instanceof HTMLElement) ph.style.display = "flex";
                        }}
                      />
                      <div
                        className="bg-surface text-foreground-2 hidden flex-col items-center justify-center gap-3 px-8 py-12"
                        style={{ display: "none" }}
                      >
                        <BarChart3 className="text-muted h-16 w-16" />
                        <span className="text-lg font-medium">{currentChart.title}</span>
                      </div>
                      <div className="absolute top-0 right-0 z-10 flex gap-2 p-2">
                        <a
                          href={currentChart.src}
                          download={currentChart.src.split("/").pop() || "chart.png"}
                          className="border-foreground/30 bg-foreground text-background hover:bg-foreground/80 flex items-center gap-1.5 border px-3 py-2 font-sans text-[10px] font-bold tracking-widest uppercase"
                          aria-label={t.chat.download}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="h-5 w-5" />
                          <span>{t.chat.download}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(null)}
                          className="border-foreground/30 bg-foreground text-background hover:bg-foreground/80 border p-2 font-sans text-[10px] font-bold tracking-widest uppercase"
                          aria-label={t.chat.close}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="border-border bg-surface hidden w-[300px] shrink-0 flex-col border md:flex">
                      <div className="border-border border-b p-4">
                        <h3 className="font-display text-foreground text-base font-bold tracking-tight uppercase">
                          {currentChart.title}
                        </h3>
                        {currentChart.type && (
                          <span className="bg-secondary text-muted mt-2 inline-block px-2 py-0.5 font-mono text-[9px] tracking-wider uppercase">
                            {currentChart.type
                              .replace("-", " + ")
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        )}
                        {currentChart.criticHint && (
                          <p className="mt-2 text-xs text-amber-200/90">
                            {currentChart.criticHint}
                          </p>
                        )}
                      </div>
                      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
                        <p className="text-foreground-2 font-sans text-xs leading-relaxed">
                          {currentChart.annotation ?? t.chat.noChartDesc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {filteredCharts.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (lightboxIndex !== null)
                    setLightboxIndex(
                      lightboxIndex < filteredCharts.length - 1 ? lightboxIndex + 1 : 0
                    );
                }}
                className="text-background hover:bg-foreground/60 shrink-0 p-2 transition-colors"
                aria-label={t.chat.next}
              >
                <ChevronRight className="h-10 w-10" />
              </button>
            )}
          </div>
        </>
      )}

      {config ? (
        /* ---- Analysis results: inline sections ---- */
        <div className="w-full max-w-4xl px-4 py-10">
          <div className="border-foreground mb-8 border-b-[3px] pb-4">
            <h2 className="font-display text-foreground text-3xl font-bold tracking-tight uppercase">
              {t.chat.processingStepsTitle}
            </h2>
            <p className="text-muted mt-1 font-mono text-[10px] tracking-widest uppercase">
              {t.chat.showingResultsFor(config.fileName)}
            </p>
          </div>

          {/* Section 1: Data Upload */}
          <DataUploadSummary
            rows={config.upload.rows}
            columns={config.upload.columns}
            columnNames={config.upload.columnNames}
            sampleData={config.upload.sampleData}
            asSection
          />

          {/* Section 2: Data Cleaning */}
          <DataCleaningSummary
            missingMsg={config.cleaning.missingMsg}
            rows={config.cleaning.rows}
            columns={config.cleaning.columns}
            columnNames={config.cleaning.columnNames}
            sampleData={config.cleaning.sampleData}
            asSection
          />

          {/* Section 3: Charts */}
          <section className="border-foreground mb-6 border-[1.5px] p-6">
            <div className="mb-4 flex items-center gap-3">
              <BarChart3 className="text-accent h-5 w-5" />
              <h3 className="font-display text-foreground text-xl font-bold tracking-tight uppercase">
                {t.chat.vizResults}
              </h3>
            </div>
            <ChartFilterButtons
              charts={charts}
              chartFilter={chartFilter}
              onFilterChange={setChartFilter}
              countLabel={t.analysis.chartsGenerated(charts.length)}
            />
            <VizPipelineIssuesPanel issues={config.vizIssues} />
            <div className="border-border bg-surface border p-4">
              {filteredCharts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <BarChart3 className="text-muted h-10 w-10" />
                  <p className="text-muted font-mono text-[10px] tracking-wider uppercase">
                    {t.chat.noChartsInCategory}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {filteredCharts.map((chart, index) => (
                    <ChartThumbnail
                      key={chart.src}
                      chart={chart}
                      index={index}
                      onSelect={() => setLightboxIndex(index)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Section 4: Insights */}
          <section className="border-foreground mb-6 border-[1.5px] p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Lightbulb className="text-accent h-5 w-5" />
                <h3 className="font-display text-foreground text-xl font-bold tracking-tight uppercase">
                  {t.chat.insightsSummary}
                </h3>
              </div>
              {showInsightsSummary && (
                <div ref={downloadMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setDownloadMenuOpen((v) => !v)}
                    className="border-foreground bg-background text-foreground hover:bg-foreground hover:text-background border px-3 py-2 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors"
                  >
                    <Download className="mr-1.5 inline h-3.5 w-3.5" />
                    {t.chat.download}
                  </button>
                  {downloadMenuOpen && (
                    <div className="border-border bg-background absolute top-full right-0 z-50 mt-1 w-44 border">
                      <button
                        type="button"
                        onClick={() => handleExport("pdf")}
                        disabled={!!exportLoading}
                        className="text-foreground hover:bg-secondary flex w-full items-center gap-2 px-4 py-2.5 font-sans text-xs transition-colors disabled:opacity-50"
                      >
                        {exportLoading === "pdf" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span className="text-destructive font-mono text-[9px] font-bold uppercase">
                            PDF
                          </span>
                        )}
                        {t.chat.exportPdf}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport("docx")}
                        disabled={!!exportLoading}
                        className="text-foreground hover:bg-secondary flex w-full items-center gap-2 px-4 py-2.5 font-sans text-xs transition-colors disabled:opacity-50"
                      >
                        {exportLoading === "docx" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span className="text-accent font-mono text-[9px] font-bold uppercase">
                            DOC
                          </span>
                        )}
                        {t.chat.exportDocx}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport("md")}
                        disabled={!!exportLoading}
                        className="text-foreground hover:bg-secondary flex w-full items-center gap-2 px-4 py-2.5 font-sans text-xs transition-colors disabled:opacity-50"
                      >
                        {exportLoading === "md" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span className="text-muted font-mono text-[9px] font-bold uppercase">
                            MD
                          </span>
                        )}
                        {t.chat.exportMarkdown}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {isInsightsGenerating ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <Loader2 className="text-accent h-8 w-8 animate-spin" />
                <p className="text-muted font-mono text-xs tracking-widest uppercase">
                  {t.chat.generatingInsights}
                </p>
              </div>
            ) : showInsightsSummary ? (
              <div className="max-h-[400px] overflow-y-auto">
                {config?.insights ??
                  (report ? reportToReactNode(report, config?.charts ?? []) : null)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-6 py-16">
                <p className="text-muted font-sans text-xs">{t.chat.generateInsightsHint}</p>
                <button
                  type="button"
                  onClick={handleGenerateInsights}
                  className="bg-foreground text-background hover:bg-foreground/80 px-8 py-3 font-sans text-xs font-bold tracking-widest uppercase transition-colors"
                >
                  <Sparkles className="mr-2 inline h-4 w-4" />
                  {t.chat.generateInsights}
                </button>
              </div>
            )}
          </section>

          {analysisId && (
            <div className="pb-6 text-center">
              <Link
                href={`/chat/${encodeURIComponent(analysisId)}`}
                className="border-border bg-background text-foreground hover:bg-secondary border px-4 py-2 font-sans text-xs font-bold tracking-widest uppercase transition-colors"
              >
                {t.chat.viewInChat}
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* ---- Welcome screen ---- */
        <div className="flex w-full max-w-2xl flex-col items-center px-6 py-24 text-center">
          <div className="bg-foreground mb-6 flex h-16 w-16 items-center justify-center">
            <BarChart3 className="text-background h-8 w-8" />
          </div>
          <h1 className="font-display text-foreground text-5xl font-black tracking-tight uppercase">
            Out of Bits
          </h1>
          <p className="text-muted mt-3 font-sans text-xs tracking-widest uppercase">
            {t.chat.platformTagline}
          </p>
          <div className="bg-foreground my-8 h-px w-32" />
          <div className="bg-foreground grid w-full max-w-xs grid-cols-3 gap-px">
            <div className="bg-background flex flex-col items-center gap-2 p-4">
              <Upload className="text-accent h-5 w-5" />
              <span className="text-muted font-mono text-[9px] tracking-widest uppercase">
                {t.chat.featureUpload}
              </span>
            </div>
            <div className="bg-background flex flex-col items-center gap-2 p-4">
              <BarChart3 className="text-accent h-5 w-5" />
              <span className="text-muted font-mono text-[9px] tracking-widest uppercase">
                {t.chat.featureCharts}
              </span>
            </div>
            <div className="bg-background flex flex-col items-center gap-2 p-4">
              <Sparkles className="text-accent h-5 w-5" />
              <span className="text-muted font-mono text-[9px] tracking-widest uppercase">
                {t.chat.featureInsights}
              </span>
            </div>
          </div>
          <p className="text-muted mt-8 font-mono text-[9px] tracking-wider uppercase">
            {t.chat.emptyStateHint}
          </p>
        </div>
      )}
    </div>
  );
}
