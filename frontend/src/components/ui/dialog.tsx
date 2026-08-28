"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="bg-foreground/50 fixed inset-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}

export function DialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-background flex max-h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden border",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function DialogHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex items-center justify-between border-b px-6 py-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-display text-foreground text-xl font-bold tracking-tight uppercase",
        className
      )}
    >
      {children}
    </h2>
  );
}

export function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted hover:text-foreground focus-visible:outline-accent p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label="Close"
    >
      <X className="h-5 w-5" />
    </button>
  );
}
