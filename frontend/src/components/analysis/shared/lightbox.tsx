"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { MarkdownContent } from "@/components/chat/markdown-content";

export interface LightboxChart {
  src: string;
  title: string;
  type?: string;
  annotation?: string;
  criticHint?: string;
}

interface LightboxProps {
  charts: LightboxChart[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}

export function Lightbox({ charts, index, onClose, onNavigate }: LightboxProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const prev = () => onNavigate(index > 0 ? index - 1 : charts.length - 1);
  const next = () => onNavigate(index < charts.length - 1 ? index + 1 : 0);
  const currentChart = charts[index];

  return (
    <div className="fixed inset-0 z-[10000]">
      <div className="bg-foreground/90 fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-4 z-[10000] flex items-center justify-center gap-2 sm:inset-6"
        onClick={(e) => e.stopPropagation()}
      >
        {charts.length > 1 && (
          <button
            type="button"
            onClick={prev}
            className="text-background hover:bg-foreground/60 shrink-0 p-2 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="h-10 w-10" />
          </button>
        )}
        <div className="flex max-h-[90vh] max-w-full min-w-0 flex-1 items-stretch gap-4">
          <div className="relative flex min-w-0 flex-1 items-center justify-center">
            <img
              src={currentChart.src}
              alt={currentChart.title}
              className="max-h-[88vh] max-w-full object-contain"
            />
            <div className="absolute top-0 right-0 z-10 flex gap-2 p-2">
              <a
                href={currentChart.src}
                download={currentChart.src.split("/").pop()}
                className="border-border bg-foreground/80 text-background hover:bg-foreground flex items-center gap-1.5 border px-3 py-2 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors"
                aria-label="Download"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-5 w-5" />
                <span>Download</span>
              </a>
              <button
                type="button"
                onClick={onClose}
                className="border-border bg-foreground/80 text-background hover:bg-foreground border p-2 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="border-accent/40 bg-surface hidden w-[300px] shrink-0 flex-col border md:flex">
            <div className="border-border border-b p-5">
              <h3 className="text-foreground text-lg leading-snug font-bold">
                {currentChart.title}
              </h3>
              {currentChart.type && (
                <span className="bg-accent/10 text-accent mt-2 inline-block px-2 py-0.5 font-mono text-[9px] tracking-wider uppercase">
                  {currentChart.type.replace("-", " + ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              )}
              {currentChart.criticHint && (
                <p className="mt-2 text-xs text-amber-200/90">{currentChart.criticHint}</p>
              )}
            </div>
            <div className="scrollbar-thin text-foreground-2 flex-1 overflow-y-auto p-5 text-sm leading-relaxed">
              {currentChart.annotation ? (
                <MarkdownContent content={currentChart.annotation} />
              ) : (
                <p>No description available for this chart.</p>
              )}
            </div>
          </div>
        </div>
        {charts.length > 1 && (
          <button
            type="button"
            onClick={next}
            className="text-background hover:bg-foreground/60 shrink-0 p-2 transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="h-10 w-10" />
          </button>
        )}
      </div>
    </div>
  );
}
