import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "primary";

/**
 * Pastilă de status: rotundă, 12px, greutate 700. Nuanțele urmează paleta
 * „Bleumarin & auriu”, numai din tokenuri: success, warning (gold-tint/warning-text),
 * danger (danger-tint/destructive), info și neutral.
 */
const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-foreground text-neutral",
  success: "bg-success-foreground text-success",
  warning: "bg-gold-tint text-warning-text",
  info: "bg-info-foreground text-info",
  danger: "bg-danger-tint text-destructive",
  primary: "bg-gold-tint text-warning-text",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
