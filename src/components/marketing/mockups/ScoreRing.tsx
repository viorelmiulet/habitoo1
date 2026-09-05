import { cn } from "@/lib/utils";

export function ScoreRing({ score, size = 44, className }: { score: number; size?: number; className?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;
  const tone = score >= 80 ? "text-success" : score >= 60 ? "text-gold" : "text-muted-foreground";
  return (
    <div
      className={cn("relative shrink-0", tone, className)}
      style={{ width: size, height: size }}
      aria-label={`Scor potrivire ${score}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-border" strokeWidth={4} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - filled)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold text-foreground"
        style={{ fontSize: size * 0.28 }}
      >
        {score}
      </span>
    </div>
  );
}
