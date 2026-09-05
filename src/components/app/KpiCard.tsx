import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "primary" | "accent" | "success" | "info" | "warning" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/20 text-accent-foreground",
  success: "bg-success/12 text-success",
  info: "bg-info/12 text-info",
  warning: "bg-warning/18 text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Card KPI: etichetă, valoare, indiciu, icon și (opțional) trend față de
 * perioada anterioară. Poate fi link către pagina de detaliu.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  trend,
  trendLabel,
  to,
  loading = false,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Variație procentuală (ex. 12 pentru +12%). */
  trend?: number | null;
  trendLabel?: string;
  to?: LinkProps["to"];
  loading?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          {loading ? (
            <Skeleton className="mt-2.5 h-7 w-20" />
          ) : (
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          )}
          {loading ? (
            <Skeleton className="mt-2 h-3 w-24" />
          ) : trend !== undefined && trend !== null ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              <TrendPill value={trend} />
              <span className="truncate text-muted-foreground">{trendLabel ?? "vs. perioada anterioară"}</span>
            </p>
          ) : hint ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", toneClass[tone])}>
            <Icon className="size-5" />
          </span>
        ) : null}
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          "panel group block p-5 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn("panel p-5", className)}>{body}</div>;
}

function TrendPill({ value }: { value: number }) {
  const rounded = Math.round(value);
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
        <Minus className="size-3" /> 0%
      </span>
    );
  }
  const up = rounded > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums",
        up ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "+" : ""}
      {rounded}%
    </span>
  );
}
