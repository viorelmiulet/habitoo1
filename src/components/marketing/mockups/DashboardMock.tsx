import {
  Building2,
  CalendarDays,
  ClipboardList,
  Phone,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { leadStageLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { mockAgenda, mockFunnel, mockGoals, mockKpis } from "../mock-data";
import { AppFrame, MockToolbar } from "./AppFrame";

const kpiIcons = [Building2, Users, ClipboardList, CalendarDays];
const kpiTones = [
  "bg-primary/10 text-primary",
  "bg-gold/15 text-gold",
  "bg-info/12 text-info",
  "bg-success/12 text-success",
];
const agendaIcons: Record<string, typeof Phone> = {
  call: Phone,
  viewing: Video,
  meeting: Users,
  followup: Sparkles,
};

export function DashboardMock({ className }: { className?: string }) {
  const max = Math.max(...mockFunnel.map((f) => f.value));
  return (
    <AppFrame title="dashboard" className={className} activeIndex={0}>
      <MockToolbar
        title="Bună dimineața, Andrei"
        meta="Marți, 14 mai · 4 activități programate azi"
        action="+ Adaugă"
      />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {mockKpis.map((k, i) => {
            const Icon = kpiIcons[i]!;
            return (
              <div key={k.label} className="panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      {k.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tracking-tight">{k.value}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{k.hint}</p>
                  </div>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      kpiTones[i],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          <div className="panel p-3 lg:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">Agenda de azi</p>
              <span className="text-[10px] text-muted-foreground">Calendar →</span>
            </div>
            <ul className="divide-y divide-border">
              {mockAgenda.map((a) => {
                const Icon = agendaIcons[a.kind] ?? Phone;
                return (
                  <li key={a.time} className="flex items-center gap-3 py-2">
                    <span className="w-10 shrink-0 text-[11px] font-semibold tabular-nums text-navy">
                      {a.time}
                    </span>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{a.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{a.meta}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="panel p-3">
              <p className="mb-2 text-xs font-semibold">Pipeline lead-uri</p>
              <ul className="space-y-1.5">
                {mockFunnel.slice(0, 5).map((f) => (
                  <li key={f.stage} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate text-[10px] text-muted-foreground">
                      {leadStageLabels[f.stage]}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(f.value / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-[10px] font-medium tabular-nums">
                      {f.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold">Obiective luna aceasta</p>
                <StatusBadge tone="success" className="text-[10px]">
                  Pe drumul bun
                </StatusBadge>
              </div>
              <ul className="space-y-2">
                {mockGoals.map((g) => (
                  <li key={g.label}>
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="font-medium">{g.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {g.current}/{g.target}
                      </span>
                    </div>
                    <Progress value={(g.current / g.target) * 100} className="h-1.5" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
