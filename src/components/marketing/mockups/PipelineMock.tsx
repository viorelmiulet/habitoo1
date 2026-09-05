import { ArrowRightLeft, GripVertical, MessageSquareText, Phone, Video } from "lucide-react";
import { leadStageLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { mockLeadHistory, mockPipeline } from "../mock-data";
import { AppFrame, MockToolbar } from "./AppFrame";

const historyIcons: Record<string, typeof Phone> = {
  stage: ArrowRightLeft,
  note: MessageSquareText,
  viewing: Video,
  call: Phone,
};

export function PipelineMock({
  className,
  withHistory = true,
  columns = 4,
}: {
  className?: string;
  withHistory?: boolean;
  columns?: 3 | 4 | 5;
}) {
  const cols = mockPipeline.slice(0, columns);
  return (
    <AppFrame title="lead-uri / pipeline" className={className} activeIndex={4}>
      <MockToolbar title="Pipeline lead-uri" meta="15 lead-uri active · vedere Kanban" action="+ Lead nou" />
      <div className={cn("grid gap-3 p-4", withHistory && "lg:grid-cols-3")}>
        <div className={cn("min-w-0", withHistory && "lg:col-span-2")}>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
          >
            {cols.map((col, ci) => (
              <div key={col.stage} className="min-w-0 rounded-xl border border-border bg-muted/40 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="truncate text-[11px] font-semibold">{leadStageLabels[col.stage]}</span>
                  <span className="rounded-full bg-background px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                    {col.cards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {col.cards.map((card, i) => {
                    const lifted = ci === 2 && i === 0;
                    return (
                      <div
                        key={card.name}
                        className={cn(
                          "rounded-lg border bg-card p-2 shadow-soft",
                          lifted
                            ? "-rotate-1 border-primary/50 shadow-raised ring-2 ring-primary/20"
                            : "border-border",
                        )}
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold">{card.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{card.subject}</p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                            {card.source}
                          </span>
                          <span className="size-4 rounded-full bg-gradient-to-br from-primary/60 to-gold/60" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {withHistory ? (
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-semibold">Istoric lead · Elena Dumitrescu</p>
            <p className="text-[10px] text-muted-foreground">Fiecare schimbare rămâne înregistrată</p>
            <ol className="mt-3 space-y-3">
              {mockLeadHistory.map((h, i) => {
                const Icon = historyIcons[h.kind] ?? Phone;
                return (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full",
                        i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] leading-snug font-medium">{h.text}</p>
                      <p className="text-[10px] text-muted-foreground">{h.when}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>
    </AppFrame>
  );
}
