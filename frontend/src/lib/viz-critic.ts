/**
 * Helpers for visualization critic metadata from the backend (skipped / error / retries).
 */

import type { VisualizationItem } from "@/lib/api/conversations";

export interface VizPipelineIssue {
  task_id: string;
  chart_type: string;
  features: string[];
  status: "skipped" | "error";
  critic_reason: string;
  failure_type?: string;
  action?: string;
  skip_kind?: string;
  replacement_requested?: boolean;
}

export type LiveVizChartWithCritic = {
  src: string;
  title: string;
  type: string;
  annotation?: string;
  /** Variables used in this visualization (from backend `features`). */
  features?: string[];
  /** Short line under thumbnail when chart passed after critic revision */
  criticHint?: string;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** One-line hint for thumbnails when there were critic retries or fallback accept. */
export function liveChartCriticHint(
  metadata: Record<string, unknown> | null | undefined
): string | undefined {
  if (!metadata) return undefined;
  const attempts = metadata.critic_attempts;
  if (Array.isArray(attempts) && attempts.length > 0) {
    return `Revised after ${attempts.length} critic round${attempts.length !== 1 ? "s" : ""}`;
  }
  const reason = str(metadata.critic_reason);
  if (reason?.includes("Critic unavailable")) {
    return "Accepted (critic unavailable)";
  }
  return undefined;
}

export function issueFromVisualizationItem(v: VisualizationItem): VizPipelineIssue | null {
  if (v.status !== "skipped" && v.status !== "error") return null;
  const md = (v.metadata ?? {}) as Record<string, unknown>;
  const critic_reason =
    str(md.critic_reason) || (v.status === "error" ? "Visualization failed" : "Skipped");
  return {
    task_id: v.task_id,
    chart_type: v.chart_type,
    features: v.features ?? [],
    status: v.status as "skipped" | "error",
    critic_reason,
    failure_type: str(md.failure_type),
    action: str(md.action),
    skip_kind: str(md.skip_kind),
    replacement_requested: md.replacement_requested === true,
  };
}

export function issueFromWsVizTask(data: {
  task_id?: string;
  chart_type?: string;
  features?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
}): VizPipelineIssue | null {
  const st = data.status;
  if (st !== "skipped" && st !== "error") return null;
  const md = data.metadata ?? {};
  const critic_reason =
    str(md.critic_reason) ||
    (data.error ? String(data.error) : undefined) ||
    str(md.failure_type) ||
    (st === "error" ? "Error" : "Skipped");
  return {
    task_id: data.task_id ?? "unknown",
    chart_type: data.chart_type ?? "chart",
    features: Array.isArray(data.features) ? data.features : [],
    status: st,
    critic_reason,
    failure_type: str(md.failure_type),
    action: str(md.action),
    skip_kind: str(md.skip_kind),
    replacement_requested: md.replacement_requested === true,
  };
}

/** Appended to assistant message for each viz_task_complete. */
export function formatVizTaskChatLine(
  status: string | undefined,
  chartType: string | undefined,
  metadata: Record<string, unknown> | null | undefined,
  error?: string | null
): string {
  const ct = chartType ?? "chart";
  const md = metadata ?? {};
  if (status === "done") {
    const hint = liveChartCriticHint(md);
    return hint ? `✅ ${ct} — ${hint}` : `✅ ${ct} generated`;
  }
  if (status === "skipped") {
    const reason = str(md.critic_reason) ?? "skipped";
    const repl = md.replacement_requested === true ? " (replanned)" : "";
    return `⏭️ ${ct} skipped${repl}: ${reason}`;
  }
  if (status === "error") {
    const reason = str(md.critic_reason) ?? (error ? String(error) : "error");
    return `❌ ${ct}: ${reason}`;
  }
  return `· ${ct} (${status ?? "?"})`;
}

export function chartFromVisualizationItem(
  v: VisualizationItem,
  imageSrc: string
): LiveVizChartWithCritic | null {
  if (v.status !== "done" || !v.image_url) return null;
  const md = (v.metadata ?? {}) as Record<string, unknown>;
  return {
    src: imageSrc,
    title: (md.title as string) || v.chart_type || "Chart",
    type: v.chart_type ?? "chart",
    annotation: v.annotation ?? undefined,
    features: v.features ?? [],
    criticHint: liveChartCriticHint(md),
  };
}
