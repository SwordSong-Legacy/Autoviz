"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";

export interface ChartThumbnailChart {
  src: string;
  title: string;
  type?: string;
  /** Shown under the thumbnail (e.g. critic revision note) */
  criticHint?: string;
}

interface ChartThumbnailProps {
  chart: ChartThumbnailChart;
  onSelect: () => void;
  /** Position in the visible grid (0-based). First 8 images get fetchpriority="high". */
  index?: number;
}

/** Append ?thumb=1 (or &thumb=1) to request a smaller server-side thumbnail. */
function toThumbUrl(src: string): string {
  if (!src) return src;
  return src.includes("?") ? `${src}&thumb=1` : `${src}?thumb=1`;
}

export function ChartThumbnail({ chart, onSelect, index = 99 }: ChartThumbnailProps) {
  const [imgError, setImgError] = useState(false);
  const thumbSrc = toThumbUrl(chart.src);
  const fetchPriority = index < 8 ? "high" : "low";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onSelect}
        className="group border-border bg-surface hover:border-foreground focus-visible:outline-accent aspect-[4/3] w-full cursor-pointer overflow-hidden border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {imgError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <BarChart3 className="text-muted h-10 w-10" />
            <span className="text-foreground font-sans text-xs font-bold">{chart.title}</span>
            <span className="text-muted font-mono text-[9px]">Chart preview</span>
          </div>
        ) : (
          <img
            src={thumbSrc}
            alt={chart.title}
            title={chart.title}
            className="h-full w-full object-cover"
            loading={index < 8 ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={fetchPriority}
            onError={() => setImgError(true)}
          />
        )}
      </button>
      {chart.criticHint ? (
        <p className="text-muted line-clamp-2 px-0.5 text-center font-mono text-[9px]">
          {chart.criticHint}
        </p>
      ) : null}
    </div>
  );
}
