import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // base: mono font, zero radius, uppercase, tight
  "inline-flex items-center rounded-none border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest transition-colors",
  {
    variants: {
      variant: {
        // forest green tint (dark mode: solid accent bg with light text for contrast)
        default: "border-accent/40 bg-accent-light text-accent dark:bg-accent dark:text-background",
        // neutral surface
        secondary: "border-border bg-surface text-muted",
        // danger
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
        // solid accent fill
        accent: "border-transparent bg-accent text-accent-foreground",
        // plain outline
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
