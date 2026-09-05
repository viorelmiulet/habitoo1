import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "primary";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning-foreground border-warning/35",
  info: "bg-info/12 text-info border-info/25",
  danger: "bg-destructive/12 text-destructive border-destructive/25",
  primary: "bg-primary/10 text-primary border-primary/25",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  success: "bg-success",
  warning: "bg-warning-foreground/70",
  info: "bg-info",
  danger: "bg-destructive",
  primary: "bg-primary",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  /** Afișează un punct colorat înaintea textului. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", dotClasses[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}
