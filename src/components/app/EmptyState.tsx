import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stare goală standard. `compact` pentru zone mici (tab-uri, carduri laterale).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 text-center",
        compact ? "py-8" : "py-16",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border/60 ring-inset",
            compact ? "size-10 rounded-xl" : "size-12",
          )}
        >
          <Icon className={compact ? "size-5" : "size-6"} />
        </span>
      ) : null}
      <div className="max-w-sm">
        <p className={cn("font-medium", compact && "text-sm")}>{title}</p>
        {description ? (
          <p className={cn("mt-1 text-muted-foreground", compact ? "text-xs" : "text-sm")}>{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
