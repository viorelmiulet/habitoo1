import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/superadmin-status";

const toneBar: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  primary: "bg-gold",
  neutral: "bg-muted-foreground/40",
};

export function SummaryCard({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: StatusTone }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-border/70 bg-card p-4 shadow-sm">
      <span className={cn("absolute inset-y-0 left-0 w-1", toneBar[tone])} aria-hidden />
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function SuperadminSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <header>
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function DetailCard({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[22px] border border-border/70 bg-card p-5 shadow-sm sm:p-6", className)}>
      <header className="mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 py-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children ?? "—"}</dd>
    </div>
  );
}

export function BackLink({ to, label }: { to: "/superadmin/agencies" | "/superadmin/users"; label: string }) {
  return (
    <Button asChild variant="ghost" className="-ml-3 h-11">
      <Link to={to}><ArrowLeft className="mr-1.5 size-4" />{label}</Link>
    </Button>
  );
}

export function DetailNotFound({ title, to, label }: { title: string; to: "/superadmin/agencies" | "/superadmin/users"; label: string }) {
  return (
    <div className="mx-auto max-w-md rounded-[22px] border border-border/70 bg-card p-8 text-center shadow-sm" data-detail-not-found>
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Poate a fost ștearsă sau adresa nu este corectă.</p>
      <div className="mt-6"><BackLink to={to} label={label} /></div>
    </div>
  );
}
