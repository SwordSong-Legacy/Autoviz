import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // zero radius, surface background, green focus ring
          "border-border bg-surface text-foreground flex h-9 w-full rounded-none border px-3 py-1 text-sm",
          "placeholder:text-muted-foreground",
          "transition-colors",
          "focus-visible:border-accent focus-visible:ring-0 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
