"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  BarChart3,
  Wrench,
  Loader2,
  Upload,
  XCircle,
  Maximize2,
  Minimize2,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import type { VisualizationItem, ReportResponse } from "@/lib/api/conversations";
import { getImageUrl } from "@/lib/api-client";
import {
  chartFromVisualizationItem,
  issueFromVisualizationItem,
  liveChartCriticHint,
  type LiveVizChartWithCritic,
  type VizPipelineIssue,
} from "@/lib/viz-critic";
import type { ProcessingStepsState, CsvSummaryData } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogCloseButton,
} from "@/components/ui/dialog";
import {
  DataUploadSummary,
  DataCleaningSummary,
  ChartThumbnail,
  ChartFilterButtons,
  ReportInsights,
  VizPipelineIssuesDialog,
  Lightbox,
} from "@/components/analysis/shared";
import { useLang } from "@/hooks/use-lang";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isConversationId(id: string): boolean {
  return UUID_REGEX.test(id);
}

// True synonym / abbreviation groups (bidirectional equivalent matching).
const VARIABLE_ALIAS_GROUPS: Record<string, string[]> = {
  volume: ["volume", "vol", "volumn", "qty", "quantity"],
};

// One-way broad concept expansion: only applied when query uses the broad term.
const BROAD_QUERY_EXPANSIONS: Record<string, string[]> = {
  time: ["date", "datetime", "timestamp", "year", "quarter", "month", "day"],
};

function normalizeVariableTerm(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "");
}

function canonicalVariableTerm(text: string): string {
  const normalized = normalizeVariableTerm(text);
  if (!normalized) return normalized;
  if (normalized.startsWith("vol")) return "volume";
  for (const [canonical, aliases] of Object.entries(VARIABLE_ALIAS_GROUPS)) {
    if (aliases.includes(normalized)) return canonical;
  }
  return normalized;
}

function buildVariableVariants(text: string): string[] {
  const canonical = canonicalVariableTerm(text);
  if (!canonical) return [];
  const aliases = VARIABLE_ALIAS_GROUPS[canonical] ?? [];
  return Array.from(new Set([canonical, ...aliases]));
}

function buildQuerySearchTerms(text: string): string[] {
  const normalized = normalizeVariableTerm(text);
  if (!normalized) return [];
  // Base: exact token + synonym/abbreviation equivalents
  const base = buildVariableVariants(normalized);
  // One-way broad expansion (e.g. time -> quarter/date/year...), NOT reverse.
  const broad = BROAD_QUERY_EXPANSIONS[normalized] ?? [];
  return Array.from(new Set([...base, ...broad.map((t) => normalizeVariableTerm(t))]));
}

function chartMatchesVariable(chart: LiveVizChart, query: string): boolean {
  if (!query.trim()) return true;
  const queryTerms = buildQuerySearchTerms(query);
  if (!queryTerms.length) return true;

  // User requested: search only against visualization title (fuzzy/alias aware).
  const titleTokens = (chart.title ?? "")
    .toLowerCase()
    .split(/[^\w\.]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  const titleVariants = new Set<string>();
  for (const token of titleTokens) {
    for (const variant of buildVariableVariants(token)) {
      titleVariants.add(variant);
    }
  }
  return queryTerms.some((v) => titleVariants.has(v));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
    return {
      columnNames,
      sampleData: structured as Record<string, unknown>[],
    };
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

/** Estimate CSV shape from raw CSV string (supports quoted commas/newlines). */
function getCsvShapeFromRaw(csvText: string): { rows: number; columns: number } | null {
  if (!csvText.trim()) return null;

  let inQuotes = false;
  let rowCount = 0;
  let currentCols = 1;
  let firstRowCols = 0;
  let rowHasData = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];

    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        i += 1; // Escaped quote ("")
      } else {
        inQuotes = !inQuotes;
      }
      rowHasData = true;
      continue;
    }

    if (!inQuotes && ch === ",") {
      currentCols += 1;
      rowHasData = true;
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (rowHasData) {
        rowCount += 1;
        if (firstRowCols === 0) firstRowCols = currentCols;
      }
      currentCols = 1;
      rowHasData = false;
      if (ch === "\r" && csvText[i + 1] === "\n") i += 1;
      continue;
    }

    if (ch.trim() !== "") rowHasData = true;
  }

  if (rowHasData) {
    rowCount += 1;
    if (firstRowCols === 0) firstRowCols = currentCols;
  }

  if (rowCount <= 0 || firstRowCols <= 0) return null;
  return {
    rows: Math.max(0, rowCount - 1), // subtract header row
    columns: firstRowCols,
  };
}

type StepStatus = "idle" | "loading" | "completed" | "error";

/* ------------------------------------------------------------------ */
/*  Section Card (always clickable, for API mode)                       */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  className,
  size = "normal",
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
  className?: string;
  size?: "normal" | "large";
}) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group focus-visible:outline-accent flex w-full cursor-pointer flex-col items-start gap-3 border p-6 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className} ${
        size === "large" ? "sm:col-span-2" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`text-current ${size === "large" ? "h-7 w-7" : "h-6 w-6"}`} />
        <h3
          className={`font-display text-foreground font-bold tracking-tight uppercase ${size === "large" ? "text-xl" : "text-lg"}`}
        >
          {title}
        </h3>
      </div>
      <p className="text-foreground-2 text-sm">{subtitle}</p>
      <span className="text-accent text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
        {t.analysis.clickToView}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Live Section Card (clickable when completed)                       */
/* ------------------------------------------------------------------ */

function LiveSectionCard({
  icon: Icon,
  title,
  subtitle,
  status,
  onClick,
  className,
  size = "normal",
  clickableWhenLoading = false,
  showGeneratingSuffix = false,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  status: StepStatus;
  onClick?: () => void;
  className?: string;
  size?: "normal" | "large";
  /** Allow opening the card while still in loading state (e.g. first chart already arrived) */
  clickableWhenLoading?: boolean;
  showGeneratingSuffix?: boolean;
}) {
  const { t } = useLang();
  const isClickable =
    (status === "completed" || (clickableWhenLoading && status === "loading")) && !!onClick;
  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`group focus-visible:outline-accent flex w-full flex-col items-start gap-3 border p-6 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className} ${
        size === "large" ? "sm:col-span-2" : ""
      } ${
        status === "loading" && !clickableWhenLoading
          ? "animate-pulse"
          : status === "error"
            ? "border-red-500/70 bg-red-950/40 text-red-400"
            : status === "idle"
              ? "border-border/60 bg-surface/50 text-muted cursor-default"
              : isClickable
                ? "hover:bg-secondary cursor-pointer"
                : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          {status === "loading" && (
            <Loader2 className={`${size === "large" ? "h-7 w-7" : "h-6 w-6"} animate-spin`} />
          )}
          {status === "completed" && (
            <CheckCircle2 className={size === "large" ? "h-7 w-7" : "h-6 w-6"} />
          )}
          {status === "error" && <XCircle className={size === "large" ? "h-7 w-7" : "h-6 w-6"} />}
          {status === "idle" && (
            <Icon className={`${size === "large" ? "h-7 w-7" : "h-6 w-6"} opacity-60`} />
          )}
        </div>
        <h3
          className={`font-display text-foreground font-bold tracking-tight uppercase ${size === "large" ? "text-xl" : "text-lg"}`}
        >
          {title}
        </h3>
      </div>
      <p className="text-foreground-2 text-sm">
        {status === "loading" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-current" />
            {subtitle
              ? showGeneratingSuffix
                ? `${subtitle} — ${t.analysis.stillGenerating}`
                : subtitle
              : t.chat.processing}
          </span>
        )}
        {status === "completed" && subtitle}
        {status === "error" && t.chat.error}
        {status === "idle" && t.chat.waiting}
      </p>
      {isClickable && (
        <span className="text-accent text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
          {t.analysis.clickToView}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

type LiveVizChart = LiveVizChartWithCritic;

interface ApiConfig {
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
  charts: LiveVizChart[];
}

interface ApiPendingState {
  fileName: string;
  uploadSubtitle: string;
  cleaningSubtitle: string;
  vizSubtitle: string;
  steps: ProcessingStepsState;
}

interface AnalysisOverviewLiveProps {
  analysisId?: string | null;
  isProcessing?: boolean;
  processingSteps?: ProcessingStepsState;
  featureEngEnabled?: boolean;
  liveCsvSummary?: CsvSummaryData | null;
  liveFeatureEngCsvSummary?: CsvSummaryData | null;
  liveVizCharts?: LiveVizChart[];
  /** Skipped / error tasks with critic metadata (live WebSocket session) */
  liveVizIssues?: VizPipelineIssue[];
  /** Charts generated during multi-turn chat turns to append to the grid. */
  additionalCharts?: LiveVizChart[];
}

export function AnalysisOverviewLive({
  analysisId,
  isProcessing = false,
  processingSteps = { dataUpload: "idle", dataCleaning: "idle", visualization: "idle" },
  featureEngEnabled = false,
  liveCsvSummary = null,
  liveFeatureEngCsvSummary = null,
  liveVizCharts = [],
  liveVizIssues = [],
  additionalCharts = [],
}: AnalysisOverviewLiveProps) {
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [apiPending, setApiPending] = useState<ApiPendingState | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiVizIssues, setApiVizIssues] = useState<VizPipelineIssue[]>([]);

  const [modalSection, setModalSection] = useState<
    "upload" | "cleaning" | "viz" | "insight" | null
  >(null);
  const [modalExpanded, setModalExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [chartFilter, setChartFilter] = useState<string>("all");
  const [variableSearch, setVariableSearch] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [chartsOverride, setChartsOverride] = useState<LiveVizChart[] | null>(null);
  const [chartsDisplayLimit, setChartsDisplayLimit] = useState(12);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [isInsightsGenerating, setIsInsightsGenerating] = useState(false);
  const [apiPollTick, setApiPollTick] = useState(0);
  const { t, lang } = useLang();
  const cleaningTitle = featureEngEnabled ? t.analysis.dataCleaning : t.analysis.dataCleaningOnly;

  const useLiveMode = isProcessing;
  const baseCharts = useLiveMode ? liveVizCharts : (apiConfig?.charts ?? []);
  const allCharts = [...(chartsOverride ?? baseCharts), ...additionalCharts];
  const seenSrcs = new Set<string>();
  const charts = allCharts.filter((c) => {
    if (seenSrcs.has(c.src)) return false;
    seenSrcs.add(c.src);
    return true;
  });
  const pipelineIssues = useLiveMode ? liveVizIssues : apiVizIssues;

  const handleLoadMore = useCallback(async () => {
    if (!analysisId || !isConversationId(analysisId)) return;
    setIsLoadingMore(true);
    try {
      await conversationsApi.generateMoreVisualizations(analysisId, (eventType, data) => {
        const d = data as {
          status?: string;
          image_path?: string;
          chart_type?: string;
          features?: string[];
          metadata?: Record<string, unknown>;
          annotation?: string;
        };
        if (eventType === "viz_task_complete" && d?.status === "done" && d?.image_path) {
          const md = d.metadata ?? {};
          const newChart: LiveVizChart = {
            src: getImageUrl(d.image_path),
            title: (md.title as string) || d.chart_type || "Chart",
            type: d.chart_type ?? "chart",
            features: Array.isArray(d.features) ? d.features : [],
            annotation: d.annotation,
            criticHint: liveChartCriticHint(md),
          };
          setChartsOverride((prev) => [...(prev ?? baseCharts), newChart]);
          if (!useLiveMode && apiConfig) {
            setApiConfig((c) => (c ? { ...c, charts: [...c.charts, newChart] } : c));
          }
        }
      });
      // Refresh full list from API to ensure consistency
      const vizList = await conversationsApi.listVisualizations(analysisId);
      const doneViz = (vizList as VisualizationItem[]).filter((v) => v.status === "done");
      const newCharts: LiveVizChart[] = doneViz
        .map((v) => (v.image_url ? chartFromVisualizationItem(v, getImageUrl(v.image_url)) : null))
        .filter((c): c is LiveVizChart => c != null);
      const refreshedIssues = (vizList as VisualizationItem[])
        .map(issueFromVisualizationItem)
        .filter((x): x is VizPipelineIssue => x != null);
      setApiVizIssues(refreshedIssues);
      setChartsOverride(newCharts);
      if (!useLiveMode) {
        setApiConfig((prev) => (prev ? { ...prev, charts: newCharts } : prev));
      }
    } catch {
      // Keep existing charts on error
    } finally {
      setIsLoadingMore(false);
    }
  }, [analysisId, useLiveMode, apiConfig, baseCharts]);
  const steps = useLiveMode
    ? processingSteps
    : {
        dataUpload: "completed" as const,
        dataCleaning: "completed" as const,
        visualization: "completed" as const,
      };

  const filteredCharts = useMemo(
    () =>
      (chartFilter === "all"
        ? charts
        : charts.filter((c) => (c.type ?? "chart") === chartFilter)
      ).filter((c) => chartMatchesVariable(c, variableSearch)),
    [charts, chartFilter, variableSearch]
  );

  const displayedCharts = useMemo(
    () => filteredCharts.slice(0, chartsDisplayLimit),
    [filteredCharts, chartsDisplayLimit]
  );
  const hasMoreCharts = filteredCharts.length > chartsDisplayLimit;

  useEffect(() => {
    setChartsDisplayLimit(12);
  }, [chartFilter]);

  useEffect(() => {
    setChartsDisplayLimit(12);
  }, [variableSearch]);

  useEffect(() => {
    if (useLiveMode || !analysisId || !isConversationId(analysisId)) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setApiLoading(true);
    setApiError(null);
    Promise.all([
      conversationsApi.getCsvContext(analysisId).catch(() => null),
      conversationsApi.listVisualizations(analysisId).catch(() => []),
      conversationsApi.getReport(analysisId).catch(() => null),
      conversationsApi.get(analysisId).catch(() => null),
    ])
      .then(([csvRes, vizList, reportRes, conversationRes]) => {
        if (cancelled) return;
        const csv = csvRes?.csv_summary;
        const vizRows = vizList as VisualizationItem[];
        const doneVizCount = vizRows.filter((v) => v.status === "done").length;
        if (!csv) {
          const firstUploadMessage =
            conversationRes?.messages?.find(
              (m) => m.role === "user" && (m.csv_filename || m.csv_content)
            ) ?? null;
          const uploadName = firstUploadMessage?.csv_filename?.trim() || "dataset";
          const uploadShape = firstUploadMessage?.csv_content
            ? getCsvShapeFromRaw(firstUploadMessage.csv_content)
            : null;
          const hasUpload = Boolean(firstUploadMessage);
          const hasVizActivity = vizRows.length > 0;

          const pendingSteps: ProcessingStepsState = {
            dataUpload: hasUpload ? "completed" : "loading",
            dataCleaning: hasUpload ? "loading" : "idle",
            visualization: hasVizActivity ? "loading" : "idle",
          };
          if (doneVizCount > 0) {
            pendingSteps.dataCleaning = "completed";
            pendingSteps.visualization = "completed";
          }

          setApiPending({
            fileName: uploadName,
            uploadSubtitle: hasUpload
              ? uploadShape
                ? t.analysis.fileShapeFormat(
                    t.analysis.datasetName,
                    uploadShape.rows.toLocaleString(),
                    uploadShape.columns
                  )
                : t.analysis.fileProcessingFormat(t.analysis.datasetName)
              : t.analysis.receivingData,
            cleaningSubtitle:
              pendingSteps.dataCleaning === "completed"
                ? t.analysis.featureEngineeringComplete
                : pendingSteps.dataCleaning === "loading"
                  ? t.chat.processing
                  : t.chat.waiting,
            vizSubtitle:
              pendingSteps.visualization === "completed"
                ? t.analysis.chartsGenerated(doneVizCount)
                : pendingSteps.visualization === "loading"
                  ? t.chat.processing
                  : t.chat.waiting,
            steps: pendingSteps,
          });
          setApiError(null);
          setApiConfig(null);
          setApiVizIssues([]);
          retryTimer = setTimeout(() => {
            if (!cancelled) setApiPollTick((n) => n + 1);
          }, 3000);
          return;
        }
        setApiPending(null);
        // Data Upload: original CSV. Data Cleaning: enhanced CSV (csv_summary)
        const originalCsv = csvRes?.original_csv_summary ?? csv;
        const { columnNames: uploadCols, sampleData: uploadSample } =
          getSampleTableFromCsv(originalCsv);
        const { columnNames: cleaningCols, sampleData: cleaningSample } =
          getSampleTableFromCsv(csv);
        const doneViz = vizRows.filter((v) => v.status === "done");
        const chartsFromApi: LiveVizChart[] = doneViz
          .map((v) =>
            v.image_url ? chartFromVisualizationItem(v, getImageUrl(v.image_url)) : null
          )
          .filter((c): c is LiveVizChart => c != null);
        const vizIssues = vizRows
          .map(issueFromVisualizationItem)
          .filter((x): x is VizPipelineIssue => x != null);
        setApiVizIssues(vizIssues);
        const fileName = uploadCols.length ? t.analysis.datasetName : t.analysis.dataName;
        setApiConfig({
          fileName,
          upload: {
            rows: originalCsv.row_count ?? 0,
            columns: originalCsv.column_count ?? 0,
            columnNames: uploadCols,
            sampleData: uploadSample,
          },
          cleaning: {
            missingMsg: csv.missing_values_handled || t.analysis.noMissingValues,
            rows: csv.row_count ?? 0,
            columns: csv.column_count ?? 0,
            columnNames: cleaningCols,
            sampleData: cleaningSample,
          },
          charts: chartsFromApi,
        });
        setReport(reportRes ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setApiError(err instanceof Error ? err.message : t.analysis.failedToLoad);
          setApiPending(null);
          setApiConfig(null);
          setApiVizIssues([]);
        }
      })
      .finally(() => {
        if (!cancelled) setApiLoading(false);
      });
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [analysisId, useLiveMode, apiPollTick, t]);

  useEffect(() => {
    setChartsOverride(null);
    setReport(null);
    setApiPollTick(0);
    setApiPending(null);
  }, [analysisId]);

  const openModal = useCallback((section: "upload" | "cleaning" | "viz" | "insight") => {
    setModalSection(section);
    setModalExpanded(false);
  }, []);

  const closeModal = useCallback(() => {
    setModalSection(null);
    setModalExpanded(false);
  }, []);

  const handleGenerateInsights = useCallback(async () => {
    if (!analysisId || !isConversationId(analysisId)) return;
    setIsInsightsGenerating(true);
    try {
      const reportRes = await conversationsApi.generateReport(analysisId, lang);
      setReport(reportRes);
    } finally {
      setIsInsightsGenerating(false);
    }
  }, [analysisId, lang]);

  const uploadData = useLiveMode
    ? liveCsvSummary
      ? getSampleTableFromCsv(liveCsvSummary)
      : null
    : apiConfig
      ? { columnNames: apiConfig.upload.columnNames, sampleData: apiConfig.upload.sampleData }
      : null;
  const cleaningData = useLiveMode
    ? liveFeatureEngCsvSummary
      ? getSampleTableFromCsv(liveFeatureEngCsvSummary)
      : null
    : apiConfig?.cleaning.columnNames && apiConfig.cleaning.sampleData
      ? { columnNames: apiConfig.cleaning.columnNames, sampleData: apiConfig.cleaning.sampleData }
      : null;

  const fileName = uploadData?.columnNames.length ? t.analysis.datasetName : t.analysis.dataName;
  const uploadSubtitle = useLiveMode
    ? uploadData
      ? t.analysis.fileShapeFormat(
          fileName,
          liveCsvSummary!.row_count.toLocaleString(),
          liveCsvSummary!.column_count
        )
      : ""
    : apiConfig
      ? t.analysis.fileShapeFormat(
          fileName,
          String(apiConfig.upload.rows),
          apiConfig.upload.columns
        )
      : "";
  const cleaningSubtitle = useLiveMode
    ? liveFeatureEngCsvSummary
      ? liveCsvSummary &&
        (liveFeatureEngCsvSummary.row_count !== liveCsvSummary.row_count ||
          liveFeatureEngCsvSummary.column_count !== liveCsvSummary.column_count)
        ? t.analysis.enhancedToFormat(
            liveFeatureEngCsvSummary.row_count.toLocaleString(),
            liveFeatureEngCsvSummary.column_count.toLocaleString()
          )
        : t.analysis.rowsColumnsFormat(
            liveFeatureEngCsvSummary.row_count.toLocaleString(),
            liveFeatureEngCsvSummary.column_count.toLocaleString()
          )
      : ""
    : apiConfig
      ? apiConfig.cleaning.rows !== apiConfig.upload.rows ||
        apiConfig.cleaning.columns !== apiConfig.upload.columns
        ? t.analysis.enhancedToFormat(
            String(apiConfig.cleaning.rows),
            String(apiConfig.cleaning.columns)
          )
        : t.analysis.rowsColumnsFormat(
            String(apiConfig.cleaning.rows),
            String(apiConfig.cleaning.columns)
          )
      : "";
  const vizSubtitle = (() => {
    const chartPart =
      charts.length > 0
        ? t.analysis.chartsGenerated(charts.length)
        : useLiveMode && steps.visualization === "completed"
          ? t.analysis.chartsGeneratedAll
          : "";
    const notePart = pipelineIssues.length > 0 ? t.analysis.reviewNotes(pipelineIssues.length) : "";
    if (chartPart && notePart) return `${chartPart} · ${notePart}`;
    return chartPart || notePart;
  })();

  const missingMsg = useLiveMode
    ? liveFeatureEngCsvSummary?.missing_values_handled || t.analysis.noMissingValues
    : (apiConfig?.cleaning.missingMsg ?? t.analysis.noMissingValues);

  if (!useLiveMode && apiLoading && !apiPending && !apiConfig) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-24">
        <Loader2 className="text-accent h-12 w-12 animate-spin" />
        <p className="text-foreground-2 text-sm">{t.analysis.loadingAnalysis}</p>
      </div>
    );
  }

  if (!useLiveMode && (apiError || (!apiConfig && analysisId && isConversationId(analysisId)))) {
    if (apiPending) {
      return (
        <div className="bg-background flex min-h-full w-full flex-col items-center font-['Inter',system-ui,sans-serif]">
          <div className="w-full max-w-4xl px-4 py-10">
            <div className="mb-10 text-center">
              <h2 className="text-foreground text-3xl font-bold tracking-tight sm:text-[2.5rem]">
                {t.analysis.title}
              </h2>
              <p className="text-foreground-2 mt-3 text-[1.05rem] leading-relaxed">
                {t.analysis.subtitle}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <LiveSectionCard
                icon={Upload}
                title={t.analysis.dataUpload}
                subtitle={apiPending.uploadSubtitle}
                status={apiPending.steps.dataUpload}
                className="border-accent/40 bg-surface text-accent"
              />
              <LiveSectionCard
                icon={Wrench}
                title={cleaningTitle}
                subtitle={apiPending.cleaningSubtitle}
                status={apiPending.steps.dataCleaning}
                className="border-accent/40 bg-surface text-accent"
              />
              <LiveSectionCard
                icon={BarChart3}
                title={t.analysis.vizResults}
                subtitle={apiPending.vizSubtitle}
                status={apiPending.steps.visualization}
                size="large"
                className="border-accent/40 bg-surface text-accent col-span-full sm:col-span-2"
                showGeneratingSuffix
              />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-sm text-amber-400">{apiError ?? t.analysis.notFound}</p>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-full w-full flex-col items-center font-['Inter',system-ui,sans-serif]">
      <div className="w-full max-w-4xl px-4 py-10">
        <div className="mb-10 text-center">
          <h2 className="text-foreground text-3xl font-bold tracking-tight sm:text-[2.5rem]">
            {t.analysis.title}
          </h2>
          <p className="text-foreground-2 mt-3 text-[1.05rem] leading-relaxed">
            {useLiveMode
              ? t.analysis.subtitleInteractive
              : t.analysis.showingResultsFor(apiConfig?.fileName ?? t.analysis.dataName)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {useLiveMode ? (
            <>
              <LiveSectionCard
                icon={Upload}
                title={t.analysis.dataUpload}
                subtitle={uploadSubtitle}
                status={steps.dataUpload}
                onClick={() => openModal("upload")}
                className="border-accent/40 bg-surface text-accent"
              />
              <LiveSectionCard
                icon={Wrench}
                title={cleaningTitle}
                subtitle={cleaningSubtitle}
                status={steps.dataCleaning}
                onClick={() => openModal("cleaning")}
                className="border-accent/40 bg-surface text-accent"
              />
              <LiveSectionCard
                icon={BarChart3}
                title={t.analysis.vizResults}
                subtitle={vizSubtitle}
                status={steps.visualization}
                onClick={() => openModal("viz")}
                size="large"
                className="border-accent/40 bg-surface text-accent col-span-full sm:col-span-2"
                clickableWhenLoading={liveVizCharts.length > 0}
                showGeneratingSuffix
              />
            </>
          ) : (
            <>
              <SectionCard
                icon={Upload}
                title={t.analysis.dataUpload}
                subtitle={uploadSubtitle}
                onClick={() => openModal("upload")}
                className="border-accent/40 bg-surface text-accent"
              />
              <SectionCard
                icon={Wrench}
                title={cleaningTitle}
                subtitle={cleaningSubtitle}
                onClick={() => openModal("cleaning")}
                className="border-accent/40 bg-surface text-accent"
              />
              <SectionCard
                icon={BarChart3}
                title={t.analysis.vizResults}
                subtitle={vizSubtitle}
                onClick={() => openModal("viz")}
                size="large"
                className="border-accent/40 bg-surface text-accent col-span-full sm:col-span-2"
              />
            </>
          )}
        </div>
      </div>

      {/* Modal: Data Upload */}
      <Dialog open={modalSection === "upload"} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent
          className={
            modalSection === "upload" && modalExpanded
              ? "fixed inset-2 z-[10000] max-h-none w-auto max-w-none"
              : "max-h-[90vh]"
          }
        >
          <DialogHeader>
            <DialogTitle>{t.analysis.dataUpload}</DialogTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setModalExpanded((e) => !e)}
                className="text-foreground-2 hover:bg-surface hover:text-foreground focus-visible:outline-accent p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
                title={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
              >
                {modalExpanded ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
              <DialogCloseButton onClick={closeModal} />
            </div>
          </DialogHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
            {uploadData ? (
              <DataUploadSummary
                rows={useLiveMode ? liveCsvSummary!.row_count : apiConfig!.upload.rows}
                columns={useLiveMode ? liveCsvSummary!.column_count : apiConfig!.upload.columns}
                columnNames={uploadData.columnNames}
                sampleData={uploadData.sampleData}
                asSection={false}
                subtitle={uploadSubtitle}
              />
            ) : (
              <p className="text-muted text-sm">{t.analysis.noDataYet}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Data Cleaning */}
      <Dialog open={modalSection === "cleaning"} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent
          className={
            modalSection === "cleaning" && modalExpanded
              ? "fixed inset-2 z-[10000] max-h-none w-auto max-w-none"
              : "max-h-[90vh]"
          }
        >
          <DialogHeader>
            <DialogTitle>{cleaningTitle}</DialogTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setModalExpanded((e) => !e)}
                className="text-foreground-2 hover:bg-surface hover:text-foreground focus-visible:outline-accent p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
                title={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
              >
                {modalExpanded ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
              <DialogCloseButton onClick={closeModal} />
            </div>
          </DialogHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
            {cleaningData ? (
              <DataCleaningSummary
                missingMsg={missingMsg}
                rows={useLiveMode ? liveFeatureEngCsvSummary!.row_count : apiConfig!.cleaning.rows}
                columns={
                  useLiveMode ? liveFeatureEngCsvSummary!.column_count : apiConfig!.cleaning.columns
                }
                columnNames={cleaningData.columnNames}
                sampleData={cleaningData.sampleData}
                asSection={false}
                subtitle={cleaningSubtitle}
              />
            ) : (
              <p className="text-muted text-sm">
                {useLiveMode ? t.analysis.noDataYet : t.analysis.noSampleData}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Visualization Results */}
      <Dialog open={modalSection === "viz"} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent
          className={
            modalSection === "viz" && modalExpanded
              ? "fixed inset-2 z-[10000] max-h-none w-auto max-w-none"
              : "max-h-[90vh]"
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="text-accent h-6 w-6" />
              {t.analysis.vizResults}
              {useLiveMode && steps.visualization === "loading" && (
                <span className="bg-accent/20 text-accent inline-flex items-center gap-1.5 px-2.5 py-0.5 font-mono text-[9px] tracking-wider uppercase">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t.analysis.generating}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setModalExpanded((e) => !e)}
                className="text-foreground-2 hover:bg-surface hover:text-foreground focus-visible:outline-accent p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
                title={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
              >
                {modalExpanded ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
              <DialogCloseButton onClick={closeModal} />
            </div>
          </DialogHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
            <ChartFilterButtons
              charts={charts}
              chartFilter={chartFilter}
              onFilterChange={setChartFilter}
              countLabel={vizSubtitle}
            />
            <div className="mt-3 mb-4 flex items-center gap-3">
              <input
                type="text"
                value={variableSearch}
                onChange={(e) => setVariableSearch(e.target.value)}
                placeholder={t.analysis.searchPlaceholder}
                className="border-border bg-surface text-foreground placeholder:text-muted focus:border-accent w-full border px-3 py-2 text-sm outline-none"
              />
              {variableSearch.trim() && (
                <button
                  type="button"
                  onClick={() => setVariableSearch("")}
                  className="border-border bg-surface text-foreground-2 hover:border-accent hover:text-foreground border px-3 py-2 text-xs font-semibold tracking-wide uppercase"
                >
                  {t.analysis.clear}
                </button>
              )}
            </div>
            <VizPipelineIssuesDialog issues={pipelineIssues} charts={charts} />
            {filteredCharts.length > 0 || (analysisId && isConversationId(analysisId)) ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {displayedCharts.map((chart, index) => (
                    <ChartThumbnail
                      key={chart.src + index}
                      chart={chart}
                      index={index}
                      onSelect={() => setLightboxIndex(index)}
                    />
                  ))}
                  {analysisId && isConversationId(analysisId) && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="border-border bg-surface/40 hover:border-accent/50 hover:bg-surface/80 focus-visible:outline-accent flex aspect-[4/3] flex-col items-center justify-center gap-2 border-2 border-dashed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="text-accent h-10 w-10 animate-spin" />
                      ) : (
                        <>
                          <BarChart3 className="text-foreground-2 h-10 w-10" />
                          <span className="text-foreground-2 text-sm font-medium">
                            {t.analysis.loadMore}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                {hasMoreCharts && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setChartsDisplayLimit((prev) => prev + 12)}
                      className="border-border bg-surface/40 text-foreground-2 hover:border-accent/50 hover:bg-surface/80 hover:text-foreground focus-visible:outline-accent border px-6 py-3 font-sans text-xs font-bold tracking-widest uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {t.analysis.showMore(filteredCharts.length - chartsDisplayLimit)}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted text-sm">
                {charts.length > 0
                  ? variableSearch.trim()
                    ? t.analysis.noChartsForVariable(variableSearch)
                    : t.analysis.noChartsInCategory
                  : t.analysis.noChartsYet}
              </p>
            )}
            {analysisId && isConversationId(analysisId) && charts.length > 0 && (
              <div className="border-border mt-8 flex flex-col items-center gap-4 border-t pt-6">
                {isInsightsGenerating ? (
                  <div className="text-foreground-2 flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">{t.analysis.generatingInsights}</span>
                  </div>
                ) : report ? (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-foreground-2 text-sm">{t.analysis.insightGenerated}</p>
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        openModal("insight");
                      }}
                      className="border-accent/40 bg-surface text-accent hover:bg-secondary hover:text-foreground flex items-center gap-2 border px-4 py-2 font-sans text-xs font-bold tracking-widest uppercase transition-colors"
                    >
                      <Lightbulb className="h-4 w-4" />
                      {t.analysis.viewInsights}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateInsights}
                    className="bg-foreground text-background hover:bg-foreground/80 flex items-center gap-2 px-4 py-2 font-sans text-xs font-bold tracking-widest uppercase transition-colors"
                  >
                    <Sparkles className="h-5 w-5" />
                    {t.analysis.generateInsights}
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Insight Summary */}
      <Dialog open={modalSection === "insight"} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent
          className={
            modalSection === "insight" && modalExpanded
              ? "fixed inset-2 z-[10000] max-h-none w-auto max-w-none"
              : "max-h-[90vh]"
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="text-accent h-6 w-6" />
              {t.analysis.insightSummary}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setModalExpanded((e) => !e)}
                className="text-foreground-2 hover:bg-surface hover:text-foreground focus-visible:outline-accent p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
                title={modalExpanded ? t.analysis.collapse : t.analysis.expandFullPage}
              >
                {modalExpanded ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
              <DialogCloseButton onClick={closeModal} />
            </div>
          </DialogHeader>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
            {report ? (
              <ReportInsights report={report} charts={charts} />
            ) : (
              <p className="text-muted text-sm">{t.analysis.noInsightSummary}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox: overlay on viz modal, close returns to viz modal */}
      {lightboxIndex !== null && filteredCharts.length > 0 && (
        <Lightbox
          charts={filteredCharts}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
