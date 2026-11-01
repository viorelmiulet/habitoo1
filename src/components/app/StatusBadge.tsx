import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "primary";

/**
 * Pastilă de status: rotundă, 12px, greutate 700. Nuanțele urmează paleta
 * „Bleumarin & auriu” (success #E6F2EC/#17603F, warning #F6EEDF/#7A561E,
 * danger #FBEAE8/#A12A1F, info/neutral #EEF1F4/#3B4651).
 */
const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-foreground text-neutral",
  success: "bg-success-foreground text-success",
  warning: "bg-gold-tint text-[#7A561E] dark:text-gold-dark",
  info: "bg-neutral-foreground text-neutral",
  danger: "bg-danger-tint text-destructive",
  primary: "bg-gold-tint text-[#7A561E] dark:text-gold-dark",
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
