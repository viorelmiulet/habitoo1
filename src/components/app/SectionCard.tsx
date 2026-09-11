import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Card de secțiune standard pentru paginile CRM: antet (titlu, descriere,
 * acțiune) + corp. Folosește utilitatea `panel` pentru consistență vizuală.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Fără padding în corp (liste / tabele). */
  flush?: boolean;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {title || action ? (
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          {Icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? <h2 className="truncate text-sm font-semibold">{title}</h2> : null}
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(!flush && "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
