import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getRonEurRate } from "@/lib/commissions-rates.functions";
import {
  breakdownBy,
  compareValue,
  inRange,
  lastYearRange,
  monthlySeries,
  previousRange,
  reportKpis,
  reportRange,
  type CommissionReportRow,
  type ReportPreset,
} from "@/lib/commissions-reports";
import { KpiCard } from "@/components/app/KpiCard";
import { SectionCard } from "@/components/app/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { propertyTypeLabels, transactionLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ALL = "__all";
const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
};

const presets: { key: ReportPreset; label: string }[] = [
  { key: "week", label: "Săptămâna curentă" },
  { key: "month", label: "Luna curentă" },
  { key: "year", label: "Anul curent" },
  { key: "custom", label: "Interval la alegere" },
];

const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("ro-RO", { month: "short", year: "2-digit" }).format(
    new Date(`${m}-01T00:00:00Z`),
  );

/**
 * Fila „Rapoarte” din Comisioane: indicatori în EUR (RON convertit cu cursul
 * BNR păstrat pe comision), comparații cu perioada anterioară și cu anul
 * trecut, grafice lunare și împărțiri. Agentul vede doar cifrele lui (RLS);
 * adminul poate filtra pe un agent.
 */
export function CommissionReports({
  orgId,
  isAdmin,
  profiles,
}: {
  orgId: string | undefined;
  isAdmin: boolean;
  profiles: { id: string; full_name: string | null }[];
}) {
  const [preset, setPreset] = useState<ReportPreset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [agent, setAgent] = useState(ALL);

  const range = useMemo(
    () => reportRange(preset, new Date(), preset === "custom" ? custom : undefined),
    [preset, custom],
  );
  const prev = useMemo(() => previousRange(range), [range]);
  const lastYear = useMemo(() => lastYearRange(range), [range]);

  const names = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name ?? "—"])),
    [profiles],
  );

  const data = useQuery({
    queryKey: ["commission-reports", orgId, range.from, range.to, agent],
    enabled: !!orgId && !!range.from && !!range.to,
    queryFn: async () => {
      // O singură citire acoperă perioada curentă, cea anterioară și anul trecut.
      let q = supabase
        .from("commissions")
        .select(
          "agent_id,transaction_date,transaction_kind,property_type,agency_commission,agent_amount,currency,status,ron_to_eur_rate",
        )
        .gte("transaction_date", lastYearRange(previousRange(range)).from)
        .lte("transaction_date", range.to)
        .limit(5000);
      if (isAdmin && agent !== ALL) q = q.eq("agent_id", agent);
      const { data: rows, error } = await q;
      if (error) throw error;
      const list = (rows ?? []) as CommissionReportRow[];

      // Comisioanele RON fără curs păstrat (mai vechi) primesc cursul zilei de la BNR.
      const missing = [
        ...new Set(
          list
            .filter((r) => r.currency === "RON" && !r.ron_to_eur_rate && r.status !== "cancelled")
            .map((r) => r.transaction_date),
        ),
      ];
      if (missing.length > 0) {
        const rates = await Promise.all(
          missing.map((d) => getRonEurRate({ data: { date: d } }).catch(() => null)),
        );
        const byDate = new Map(missing.map((d, i) => [d, rates[i]?.rate ?? null]));
        for (const r of list) {
          if (r.currency === "RON" && !r.ron_to_eur_rate) {
            r.ron_to_eur_rate = byDate.get(r.transaction_date) ?? null;
          }
        }
      }
      return list;
    },
  });

  const rows = data.data ?? [];
  const cur = useMemo(() => reportKpis(rows.filter((r) => inRange(r.transaction_date, range))), [rows, range]);
  const prevK = useMemo(() => reportKpis(rows.filter((r) => inRange(r.transaction_date, prev))), [rows, prev]);
  const lyK = useMemo(() => reportKpis(rows.filter((r) => inRange(r.transaction_date, lastYear))), [rows, lastYear]);
  const series = useMemo(() => monthlySeries(rows, range), [rows, range]);
  const byKind = useMemo(
    () =>
      breakdownBy(rows.filter((r) => inRange(r.transaction_date, range)), "transaction_kind").map((s) => ({
        ...s,
        name: transactionLabels[s.key] ?? s.key,
      })),
    [rows, range],
  );
  const byType = useMemo(
    () =>
      breakdownBy(rows.filter((r) => inRange(r.transaction_date, range)), "property_type").map((s) => ({
        ...s,
        name: propertyTypeLabels[s.key] ?? s.key,
      })),
    [rows, range],
  );
  const byAgent = useMemo(
    () =>
      breakdownBy(rows.filter((r) => inRange(r.transaction_date, range)), "agent_id").map((s) => ({
        ...s,
        name: names.get(s.key) ?? "—",
      })),
    [rows, range, names],
  );

  const eur = (v: number) => formatMoney(Math.round(v), "EUR");
  const vsLastYear = (current: number, ref: number) => {
    const c = compareValue(current, ref);
    return `vs. anul trecut: ${c.pct === null ? "—" : `${c.pct > 0 ? "+" : ""}${Math.round(c.pct)}%`} (${c.diff >= 0 ? "+" : ""}${eur(c.diff)})`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {preset === "custom" ? (
          <>
            <div>
              <Label>De la</Label>
              <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </div>
            <div>
              <Label>Până la</Label>
              <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </div>
          </>
        ) : null}
        {isAdmin ? (
          <div className="min-w-48">
            <Label>Agent</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toți agenții</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {range.from} — {range.to} · totaluri în EUR, la cursul BNR din ziua tranzacției
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiWithLastYear label="Comision agenție" value={eur(cur.agencyEur)}
          trend={compareValue(cur.agencyEur, prevK.agencyEur).pct}
          lastYear={vsLastYear(cur.agencyEur, lyK.agencyEur)} loading={data.isLoading} />
        <KpiWithLastYear label="Suma agenților" value={eur(cur.agentEur)}
          trend={compareValue(cur.agentEur, prevK.agentEur).pct}
          lastYear={vsLastYear(cur.agentEur, lyK.agentEur)} loading={data.isLoading} />
        <KpiWithLastYear label="Tranzacții" value={String(cur.count)}
          trend={compareValue(cur.count, prevK.count).pct}
          lastYear={vsLastYear(cur.count, lyK.count)} loading={data.isLoading} />
        <KpiWithLastYear label="Comision mediu / tranzacție" value={eur(cur.avgEur)}
          trend={compareValue(cur.avgEur, prevK.avgEur).pct}
          lastYear={vsLastYear(cur.avgEur, lyK.avgEur)} loading={data.isLoading} />
        <KpiWithLastYear label="Încasat" value={eur(cur.collectedEur)} tone="success"
          trend={compareValue(cur.collectedEur, prevK.collectedEur).pct}
          lastYear={vsLastYear(cur.collectedEur, lyK.collectedEur)} loading={data.isLoading} />
        <KpiWithLastYear label="De încasat" value={eur(cur.pendingEur)} tone="warning"
          trend={compareValue(cur.pendingEur, prevK.pendingEur).pct}
          lastYear={vsLastYear(cur.pendingEur, lyK.pendingEur)} loading={data.isLoading} />
      </div>

      <SectionCard title="Evoluția pe luni" description="Perioada aleasă comparată cu anul trecut (EUR)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} tickFormatter={monthLabel} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <ReTooltip contentStyle={tooltipStyle} labelFormatter={monthLabel} />
              <Legend />
              <Bar dataKey="current" name="Perioada aleasă" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="lastYear" name="Anul trecut" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className={cn("grid gap-6", isAdmin ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
        <SectionCard title="Pe tip tranzacție" description="Comisionul agenției (EUR)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byKind} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                  {byKind.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Legend />
                <ReTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Pe tip proprietate" description="Comisionul agenției (EUR)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                  {byType.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Legend />
                <ReTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {isAdmin ? (
          <SectionCard title="Clasament agenți" description="Comisionul agenției pe agent (EUR)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byAgent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={12} tickLine={false} axisLine={false} width={110} />
                  <ReTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Comision" fill="var(--color-chart-2)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

function KpiWithLastYear({
  label,
  value,
  trend,
  lastYear,
  tone,
  loading,
}: {
  label: string;
  value: string;
  trend: number | null;
  lastYear: string;
  tone?: "success" | "warning";
  loading: boolean;
}) {
  return (
    <div className="space-y-1">
      <KpiCard label={label} value={value} trend={trend} trendLabel="vs. perioada anterioară" tone={tone} loading={loading} />
      <p className="px-1 text-xs text-muted-foreground">{lastYear}</p>
    </div>
  );
}
