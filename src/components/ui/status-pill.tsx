import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type StatusPillState = "published" | "pending" | "error" | "inactive";

const stateClasses: Record<StatusPillState, string> = {
  published: "border-success/20 bg-success-foreground text-success",
  pending: "border-primary/25 bg-gold-tint text-gold-dark",
  error: "border-danger-border bg-danger-tint text-destructive",
  inactive: "border-neutral/15 bg-neutral-foreground text-neutral",
};

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  state: StatusPillState;
  dot?: boolean;
};

export function StatusPill({ state, dot = false, className, children, ...props }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        stateClasses[state],
        className,
      )}
      {...props}
    >
      {dot ? <span className="size-1.5 shrink-0 rounded-pill bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
