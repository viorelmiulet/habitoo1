import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/card";

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
  dataTour,
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
  /** Ancoră pentru turul ghidat. */
  dataTour?: string;
}) {
  return (
    <Panel asChild>
      <section data-tour={dataTour} className={cn("overflow-hidden rounded-card", className)}>
        {title || action ? (
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            {Icon ? <Icon className="size-[18px] shrink-0 text-navy-muted" /> : null}
            <div className="min-w-0 flex-1">
              {title ? <h2 className="truncate text-base font-bold">{title}</h2> : null}
              {description ? (
                <p className="truncate text-[13px] text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
          </header>
        ) : null}
        <div className={cn(!flush && "p-4 sm:p-5", bodyClassName)}>{children}</div>
      </section>
    </Panel>
  );
}
