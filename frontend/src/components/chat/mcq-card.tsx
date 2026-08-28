"use client";

import { Loader2 } from "lucide-react";
import { useLang } from "@/hooks/use-lang";

interface McqCardProps {
  question: string;
  options: string[];
  onAnswer: (answer: string | null) => void;
  disabled?: boolean;
}

export function McqCard({ question, options, onAnswer, disabled = false }: McqCardProps) {
  const { t } = useLang();
  return (
    <div
      className="w-full max-w-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
      data-testid="mcq-card"
    >
      {/* Header */}
      <div className="border-b border-[var(--color-border)] px-6 py-4">
        <p
          className="font-display text-xs font-black tracking-widest uppercase"
          style={{ color: "var(--color-accent)" }}
        >
          {t.mcq.title}
        </p>
        <p className="mt-0.5 font-sans text-xs" style={{ color: "var(--color-muted-foreground)" }}>
          {t.mcq.subtitle}
        </p>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Question */}
        <p
          className="font-sans text-base leading-snug font-medium"
          style={{ color: "var(--color-foreground)" }}
        >
          {question}
        </p>

        {/* Options */}
        <div className="mt-5 flex flex-col gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(option)}
              className="w-full border border-[var(--color-border)] bg-transparent px-4 py-3 text-left font-sans text-sm font-medium transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: "var(--color-foreground)" }}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Skip */}
        <div className="mt-4 flex items-center justify-end">
          {disabled && (
            <Loader2
              className="mr-3 h-4 w-4 animate-spin"
              style={{ color: "var(--color-muted-foreground)" }}
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAnswer(null)}
            className="font-sans text-xs underline underline-offset-2 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--color-muted-foreground)" }}
          >
            {t.mcq.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
