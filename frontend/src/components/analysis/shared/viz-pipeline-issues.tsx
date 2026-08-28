"use client";

import { useState } from "react";
import {
  AlertTriangle,
  XCircle,
  SkipForward,
  RefreshCw,
  CheckCircle2,
  Activity,
  BarChart2,
  ArrowRight,
  Hash,
} from "lucide-react";
import type { VizPipelineIssue, LiveVizChartWithCritic } from "@/lib/viz-critic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { useLang } from "@/hooks/use-lang";

/* ------------------------------------------------------------------ */
/*  Metric Card                                                         */
/* ------------------------------------------------------------------ */

type MetricVariant = "default" | "success" | "warning" | "error" | "info";

const cardStyles: Record<MetricVariant, string> = {
  default: "border-border bg-surface",
  success: "border-accent/40 bg-surface",
  warning: "border-border bg-surface",
  error: "border-destructive/40 bg-surface",
  info: "border-border bg-surface",
};

const valueStyles: Record<MetricVariant, string> = {
  default: "text-foreground",
  success: "text-accent",
  warning: "text-foreground",
  error: "text-destructive",
  info: "text-foreground",
};

const iconStyles: Record<MetricVariant, string> = {
  default: "text-muted",
  success: "text-accent",
  warning: "text-muted",
  error: "text-destructive",
  info: "text-muted",
};

function MetricCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: MetricVariant;
}) {
  return (
    <div className={`flex items-center gap-3 border p-3 ${cardStyles[variant]}`}>
      <Icon className={`h-5 w-5 shrink-0 ${iconStyles[variant]}`} />
      <div className="min-w-0">
        <p className="text-muted font-mono text-[9px] tracking-wider uppercase">{label}</p>
        <p className={`font-display text-xl leading-tight font-bold ${valueStyles[variant]}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VizPipelineIssuesDialog — button trigger + nested dialog            */
/* ------------------------------------------------------------------ */

interface VizPipelineIssuesDialogProps {
  issues: VizPipelineIssue[];
  /** Pass generated charts so the dialog can compute performance metrics. */
  charts?: LiveVizChartWithCritic[];
}

export function VizPipelineIssuesDialog({ issues, charts = [] }: VizPipelineIssuesDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();

  if (!issues.length) return null;

  /* ── Derived metrics ── */
  const errorCount = issues.filter((i) => i.status === "error").length;
  const skipCount = issues.filter((i) => i.status === "skipped").length;
  const replCount = issues.filter((i) => i.replacement_requested).length;
  const revisedCount = charts.filter((c) => c.criticHint?.startsWith("Revised")).length;
  const totalTasks = charts.length + issues.length;
  const successRate = totalTasks > 0 ? Math.round((charts.length / totalTasks) * 100) : 0;

  const rateBarColor =
    successRate >= 80 ? "bg-emerald-500" : successRate >= 50 ? "bg-amber-500" : "bg-red-500";

  const rateLabel =
    successRate >= 80
      ? t.pipeline.rateGood
      : successRate >= 50
        ? t.pipeline.rateModerate
        : t.pipeline.rateLow;

  const rateLabelColor =
    successRate >= 80 ? "text-accent" : successRate >= 50 ? "text-foreground" : "text-destructive";

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-surface text-foreground hover:border-foreground focus-visible:outline-accent mb-4 inline-flex items-center gap-2 border px-3 py-1.5 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {t.pipeline.issues}
        <span className="bg-foreground/10 px-1.5 py-0.5 font-mono text-[9px] tabular-nums">
          {issues.length}
        </span>
        <ArrowRight className="h-3 w-3 opacity-50" />
      </button>

      {/* ── Issues dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-lg font-bold tracking-tight uppercase">
              <Activity className="h-5 w-5 text-amber-400" />
              {t.pipeline.diagnostics}
            </DialogTitle>
            <DialogCloseButton onClick={() => setOpen(false)} />
          </DialogHeader>

          <div className="scrollbar-thin flex-1 space-y-7 overflow-y-auto p-6">
            {/* ── Section 1: Performance Overview ── */}
            <section>
              <h3 className="text-muted mb-3 flex items-center gap-2 font-sans text-[10px] font-bold tracking-widest uppercase">
                <BarChart2 className="text-muted h-4 w-4" />
                {t.pipeline.genPerformance}
              </h3>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MetricCard
                  label={t.pipeline.totalPlanned}
                  value={totalTasks}
                  icon={Activity}
                  variant="default"
                />
                <MetricCard
                  label={t.pipeline.generated}
                  value={charts.length}
                  icon={CheckCircle2}
                  variant="success"
                />
                <MetricCard
                  label={t.pipeline.criticRevisions}
                  value={revisedCount}
                  icon={RefreshCw}
                  variant="info"
                />
                <MetricCard
                  label={t.pipeline.skipped}
                  value={skipCount}
                  icon={SkipForward}
                  variant={skipCount > 0 ? "warning" : "default"}
                />
                <MetricCard
                  label={t.pipeline.failed}
                  value={errorCount}
                  icon={XCircle}
                  variant={errorCount > 0 ? "error" : "default"}
                />
                <MetricCard
                  label={t.pipeline.replacementsQueued}
                  value={replCount}
                  icon={RefreshCw}
                  variant={replCount > 0 ? "info" : "default"}
                />
              </div>

              {/* Success rate bar */}
              {totalTasks > 0 && (
                <div className="border-border bg-surface mt-3 border p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted font-mono text-[10px]">
                      {t.pipeline.successRate}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${rateLabelColor}`}>{rateLabel}</span>
                      <span className="text-foreground font-mono text-[10px] font-bold tabular-nums">
                        {successRate}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-border h-1.5 w-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-700 ${rateBarColor}`}
                      style={{ width: `${successRate}%` }}
                    />
                  </div>
                  <p className="text-muted mt-2 font-mono text-[9px]">
                    {t.pipeline.chartsOfTotal(charts.length, totalTasks)}
                    {revisedCount > 0 && ` ${t.pipeline.revisedByCritic(revisedCount)}`}
                    {replCount > 0 && ` ${t.pipeline.replacementsQueuedCount(replCount)}`}
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 2: Issue Details ── */}
            <section>
              <h3 className="text-muted mb-3 flex items-center gap-2 font-sans text-[10px] font-bold tracking-widest uppercase">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                {t.pipeline.issueDetails}
                <span className="text-muted ml-auto font-mono text-[9px]">
                  {t.pipeline.issueCount(issues.length)}
                </span>
              </h3>

              <ul className="space-y-2.5">
                {issues.map((issue) => (
                  <li key={issue.task_id} className="border-border bg-surface border p-4">
                    {/* Header row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {issue.status === "error" ? (
                        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                      ) : (
                        <SkipForward className="h-4 w-4 shrink-0 text-amber-400" />
                      )}
                      <span
                        className={
                          issue.status === "error"
                            ? "text-destructive font-sans text-xs font-bold"
                            : "text-foreground font-sans text-xs font-bold"
                        }
                      >
                        {issue.status === "error"
                          ? t.pipeline.failedLabel
                          : t.pipeline.skippedLabel}
                      </span>
                      <span className="text-border">·</span>
                      <span className="text-foreground font-sans text-xs">{issue.chart_type}</span>
                      {issue.features.length > 0 && (
                        <span className="text-muted font-mono text-[9px]">
                          ({issue.features.join(", ")})
                        </span>
                      )}
                    </div>

                    {/* Reason */}
                    <p className="text-muted mt-1.5 font-sans text-xs leading-relaxed">
                      {issue.critic_reason}
                    </p>

                    {/* Tags */}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {issue.failure_type && (
                        <span className="bg-secondary text-muted px-1.5 py-0.5 font-mono text-[9px]">
                          {issue.failure_type}
                        </span>
                      )}
                      {issue.action && (
                        <span className="bg-secondary text-muted px-1.5 py-0.5 font-mono text-[9px]">
                          {t.pipeline.actionLabel}: {issue.action}
                        </span>
                      )}
                      {issue.skip_kind && (
                        <span className="bg-secondary text-muted px-1.5 py-0.5 font-mono text-[9px]">
                          {issue.skip_kind}
                        </span>
                      )}
                      {issue.replacement_requested && (
                        <span className="bg-accent/10 text-accent px-1.5 py-0.5 font-mono text-[9px]">
                          {t.pipeline.replacementQueued}
                        </span>
                      )}
                    </div>

                    {/* Task ID (for developers) */}
                    <p className="text-muted mt-2 flex items-center gap-1 font-mono text-[9px]">
                      <Hash className="h-2.5 w-2.5" />
                      {issue.task_id}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  VizPipelineIssuesPanel — kept for non-dialog usage (processing-steps) */
/* ------------------------------------------------------------------ */

export function VizPipelineIssuesPanel({ issues }: { issues: VizPipelineIssue[] }) {
  const { t } = useLang();
  if (!issues.length) return null;

  return (
    <div className="border-border bg-surface mb-6 border p-4">
      <h4 className="text-foreground font-sans text-[10px] font-bold tracking-widest uppercase">
        {t.pipeline.criticNotes}
      </h4>
      <p className="text-muted mt-1 font-mono text-[9px]">{t.pipeline.criticNotesDesc}</p>
      <ul className="mt-3 space-y-3">
        {issues.map((issue) => (
          <li
            key={issue.task_id}
            className="border-accent text-foreground border-l-[2px] pl-3 font-sans text-xs"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                className={
                  issue.status === "error"
                    ? "text-destructive font-bold"
                    : "text-foreground font-bold"
                }
              >
                {issue.status === "error" ? t.pipeline.failedLabel : t.pipeline.skippedLabel}
              </span>
              <span className="text-border">·</span>
              <span className="text-foreground font-sans font-bold">{issue.chart_type}</span>
              {issue.features.length > 0 && (
                <span className="text-muted font-mono text-[9px]">
                  ({issue.features.join(", ")})
                </span>
              )}
            </div>
            <p className="text-muted mt-1 font-sans text-xs leading-relaxed">
              {issue.critic_reason}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {issue.failure_type && (
                <span className="bg-secondary text-muted px-1.5 py-0.5 font-mono text-[9px]">
                  {issue.failure_type}
                </span>
              )}
              {issue.action && (
                <span className="bg-secondary text-muted px-1.5 py-0.5 font-mono text-[9px]">
                  {t.pipeline.actionLabel}: {issue.action}
                </span>
              )}
              {issue.skip_kind && (
                <span className="bg-secondary text-muted px-1.5 py-0.5 font-mono text-[9px]">
                  {issue.skip_kind}
                </span>
              )}
              {issue.replacement_requested && (
                <span className="bg-accent/10 text-accent px-1.5 py-0.5 font-mono text-[9px]">
                  {t.pipeline.replacementQueued}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
