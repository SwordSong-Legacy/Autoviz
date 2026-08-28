"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { ChartThumbnail } from "@/components/analysis/shared/chart-thumbnail";
import { Lightbox } from "@/components/analysis/shared/lightbox";
import type { LiveVizChartForChat } from "@/types";

interface VizChatCardProps {
  charts: LiveVizChartForChat[];
}

export function VizChatCard({ charts }: VizChatCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (charts.length === 0) return null;

  return (
    <div className="border-border bg-surface mt-3 border">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="hover:bg-secondary flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="text-accent h-4 w-4" />
          <span className="font-display text-foreground text-sm font-bold tracking-tight uppercase">
            {charts.length} Chart{charts.length !== 1 ? "s" : ""} Generated
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="text-muted h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="text-muted h-3.5 w-3.5" />
        )}
      </button>

      {/* Grid */}
      {!collapsed && (
        <div className="grid grid-cols-3 gap-2 p-3">
          {charts.map((chart, i) => (
            <ChartThumbnail
              key={chart.src || chart.title + String(i)}
              chart={{ src: chart.src, title: chart.title, type: chart.type }}
              onSelect={() => setLightboxIndex(i)}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          charts={charts}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
