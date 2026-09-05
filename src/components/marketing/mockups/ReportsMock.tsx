import { Progress } from "@/components/ui/progress";
import { leadStageLabels } from "@/lib/labels";
import { mockAgentActivity, mockFunnel, mockGoals } from "../mock-data";
import { AppFrame, MockToolbar } from "./AppFrame";

const sources = [
  { label: "Website", value: 38 },
  { label: "Recomandări", value: 27 },
  { label: "Telefon", value: 21 },
  { label: "Portaluri", value: 14 },
];

export function ReportsMock({ className }: { className?: string }) {
  const max = Math.max(...mockFunnel.map((f) => f.value));
  return (
    <AppFrame title="rapoarte" className={className} activeIndex={7}>
      <MockToolbar title="Rapoarte" meta="Luna curentă · toată agenția" action="Export" />
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <div className="panel p-3">
          <p className="text-xs font-semibold">Funnel lead-uri pe etape</p>
          <p className="text-[10px] text-muted-foreground">De la primul contact la câștigat</p>
          <div className="mt-3 flex h-28 items-end gap-1.5">
            {mockFunnel.map((f, i) => (
              <div key={f.stage} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[9px] font-medium tabular-nums">{f.value}</span>
                <div
                  className="w-full rounded-t-md bg-primary"
                  style={{ height: `${(f.value / max) * 80}px`, opacity: 1 - i * 0.09 }}
                />
                <span className="w-full truncate text-center text-[8px] text-muted-foreground">
                  {leadStageLabels[f.stage]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-3">
          <p className="text-xs font-semibold">Surse lead-uri</p>
          <p className="text-[10px] text-muted-foreground">Ponderea fiecărei surse</p>
          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li key={s.label}>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-muted-foreground">{s.value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${s.value}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-3">
          <p className="text-xs font-semibold">Obiective pe agent</p>
          <ul className="mt-3 space-y-2.5">
            {mockGoals.map((g) => (
              <li key={g.label}>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="font-medium">
                    {g.agent} · {g.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {g.current}/{g.target}
                  </span>
                </div>
                <Progress value={(g.current / g.target) * 100} className="h-1.5" />
              </li>
            ))}
          </ul>
        </div>

        <div className="panel overflow-hidden p-0">
          <p className="px-3 pt-3 text-xs font-semibold">Activitatea agenților</p>
          <table className="mt-2 w-full text-[10px]">
            <thead>
              <tr className="border-y border-border bg-muted/50 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Agent</th>
                <th className="px-2 py-1.5 text-right font-medium">Apeluri</th>
                <th className="px-2 py-1.5 text-right font-medium">Vizionări</th>
                <th className="px-3 py-1.5 text-right font-medium">Lead-uri</th>
              </tr>
            </thead>
            <tbody>
              {mockAgentActivity.map((a) => (
                <tr key={a.agent} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 font-medium">{a.agent}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.calls}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.viewings}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{a.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
