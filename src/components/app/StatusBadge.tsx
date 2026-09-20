import { StatusPill, type StatusPillState } from "@/components/ui/status-pill";

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "primary";

const toneStates: Record<Tone, StatusPillState> = {
  neutral: "inactive",
  success: "published",
  warning: "pending",
  info: "inactive",
  danger: "error",
  primary: "pending",
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
    <StatusPill state={toneStates[tone]} dot={dot} className={className}>
      {children}
    </StatusPill>
  );
}
