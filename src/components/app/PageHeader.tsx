import type { ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Antet de pagină standard: (link înapoi) · eyebrow · titlu · descriere ·
 * meta (badge-uri) · acțiuni. Compatibil cu utilizarea existentă
 * `<PageHeader title description actions />`.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  meta,
  backTo,
  backLabel = "Înapoi",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Text mic deasupra titlului (ex. „Proprietate · RF-1001”). */
  eyebrow?: ReactNode;
  /** Rând de badge-uri / informații scurte sub titlu. */
  meta?: ReactNode;
  backTo?: LinkProps["to"];
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {backTo ? (
        <Link
          to={backTo}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
          {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
