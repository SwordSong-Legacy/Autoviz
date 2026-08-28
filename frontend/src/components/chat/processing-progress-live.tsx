"use client";

import { CheckCircle2, Loader2, BarChart3, Wrench, Upload, XCircle } from "lucide-react";
import type { ProcessingStepsState } from "@/types";

interface ProcessingProgressLiveProps {
  steps: ProcessingStepsState;
}

function StepCard({
  icon: Icon,
  title,
  status,
}: {
  icon: React.ElementType;
  title: string;
  status: "idle" | "loading" | "completed" | "error";
}) {
  const cardClass =
    status === "loading"
      ? "border-accent bg-surface text-accent animate-pulse"
      : status === "completed"
        ? "border-accent/40 bg-surface text-accent"
        : status === "error"
          ? "border-destructive/40 bg-surface text-destructive"
          : "border-border bg-surface text-muted";

  return (
    <div className={`flex items-center gap-4 border p-5 transition-all duration-300 ${cardClass}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center">
        {status === "loading" && <Loader2 className="h-6 w-6 animate-spin" />}
        {status === "completed" && <CheckCircle2 className="h-6 w-6" />}
        {status === "error" && <XCircle className="h-6 w-6" />}
        {status === "idle" && <Icon className="h-6 w-6 opacity-60" />}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-foreground font-sans font-bold">{title}</h3>
        <p className="mt-0.5 font-mono text-xs">
          {status === "loading" && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-ping bg-current" />
              Processing...
            </span>
          )}
          {status === "completed" && "Completed"}
          {status === "error" && "Error"}
          {status === "idle" && "Waiting"}
        </p>
      </div>
    </div>
  );
}

export function ProcessingProgressLive({ steps }: ProcessingProgressLiveProps) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6 py-12">
      <div className="text-center">
        <h2 className="font-display text-foreground text-2xl font-black tracking-tight uppercase">
          Processing your data
        </h2>
        <p className="text-muted mt-2 font-mono text-[9px] tracking-wider uppercase">
          Real-time progress from backend pipeline
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        <StepCard icon={Upload} title="Data Upload" status={steps.dataUpload} />
        <StepCard
          icon={Wrench}
          title="Data Cleaning & Feature Engineering"
          status={steps.dataCleaning}
        />
        <StepCard icon={BarChart3} title="Visualization" status={steps.visualization} />
      </div>
    </div>
  );
}
