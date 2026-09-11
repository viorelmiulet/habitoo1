import type { ReactNode } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Kanban,
  LayoutDashboard,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navIcons = [
  LayoutDashboard,
  Building2,
  Users,
  ClipboardList,
  Kanban,
  Sparkles,
  CalendarDays,
  BarChart3,
];

/**
 * Browser-window style frame used for product mockups on the public site.
 * Purely presentational; the content is demonstrative.
 */
export function AppFrame({
  title,
  children,
  className,
  sidebar = true,
  activeIndex = 0,
  label = "Interfață demonstrativă",
}: {
  title: string;
  children: ReactNode;
  className?: string;
  sidebar?: boolean;
  activeIndex?: number;
  label?: string;
}) {
  return (
    <div
      className={cn("mk-frame min-w-0 overflow-hidden", className)}
      role="img"
      aria-label={`${label}: ${title}`}
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-3 py-2">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/60" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md border border-border bg-background px-3 text-[10px] text-muted-foreground">
          <span className="truncate">app.habitoo.ro / {title}</span>
        </div>
      </div>
      <div className="flex min-h-0">
        {sidebar ? (
          <aside
            aria-hidden
            className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3 sm:flex"
          >
            {navIcons.map((Icon, i) => (
              <span
                key={i}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/60",
                  i === activeIndex && "bg-sidebar-primary text-sidebar-primary-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
            ))}
          </aside>
        ) : null}
        <div className="min-w-0 flex-1 bg-background">{children}</div>
      </div>
    </div>
  );
}

export function MockToolbar({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
      </div>
      {action ? (
        <span className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
          {action}
        </span>
      ) : null}
    </div>
  );
}
