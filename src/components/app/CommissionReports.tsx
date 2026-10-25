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
import { readCommissions } from "@/lib/commissions-data";
import { CommissionCurrencySelect } from "./CommissionCurrencySelect";
import { Download } from "lucide-react";
import { toastError } from "@/lib/errors";
import { deliverCommissionFile } from "@/lib/commissions-download";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commissionFilename } from "@/lib/commissions-export";
import {
  breakdownBy,
  compareValue,
  inRange,
  lastYearRange,
  monthlySeries,
  previousRange,
  reportKpis,
  reportRange,
  type DisplayCurrency,
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
  userId,
  agencyName,
  currency,
  onCurrencyChange,
  isAdmin,
  profiles,
}: {
  orgId: string | undefined;
  userId: string;
  agencyName: string;
  currency: DisplayCurrency;
  onCurrencyChange: (v: DisplayCurrency) => void;
  isAdmin: boolean;
  profiles: { id: string; full_name: string | null }[];
}) {
  const [preset, setPreset] = useState<ReportPreset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [agent, setAgent] = useState(ALL);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdf, setPdf] = useState<{blob: Blob; filename: string} | null>(null);

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
    queryKey: ["commission-reports", orgId, userId, isAdmin, range.from, range.to, agent],
    enabled: !!orgId && !!range.from && !!range.to,
    queryFn: async () => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      return readCommissions({ from: lastYearRange(previousRange(range)).from, to: range.to, agent, kind: ALL, ptype: ALL, status: ALL }, { orgId, userId, isAdmin });
    },
  });

  const rows = data.data ?? [];
  const cur = useMemo(() => reportKpis(rows.filter((r) => inRange(r.transaction_date, range)), currency), [rows, range, currency]);
  const prevK = useMemo(() => reportKpis(rows.filter((r) => inRange(r.transaction_date, prev)), currency), [rows, prev, currency]);
  const lyK = useMemo(() => reportKpis(rows.filter((r) => inRange(r.transaction_date, lastYear)), currency), [rows, lastYear, currency]);
  const series = useMemo(() => monthlySeries(rows, range, currency), [rows, range, currency]);
  const byKind = useMemo(
    () =>
      breakdownBy(rows.filter((r) => inRange(r.transaction_date, range)), "transaction_kind", currency).map((s) => ({
        ...s,
        name: transactionLabels[s.key] ?? s.key,
      })),
    [rows, range, currency],
  );
  const byType = useMemo(
    () =>
      breakdownBy(rows.filter((r) => inRange(r.transaction_date, range)), "property_type", currency).map((s) => ({
        ...s,
        name: propertyTypeLabels[s.key] ?? s.key,
      })),
    [rows, range, currency],
  );
  const byAgent = useMemo(
    () =>
      breakdownBy(rows.filter((r) => inRange(r.transaction_date, range)), "agent_id", currency).map((s) => ({
        ...s,
        name: names.get(s.key) ?? "—",
      })),
    [rows, range, names, currency],
  );

  const eur = (v: number) => formatMoney(Math.round(v), currency);
  const comparison = (current: number, ref: number, label: string, count = false) => {
    const c = compareValue(current, ref);
    return `${label}: ${c.pct === null ? "—" : `${c.pct > 0 ? "+" : ""}${Math.round(c.pct)}%`} (${c.diff >= 0 ? "+" : ""}${count ? c.diff : eur(c.diff)})`;
  };
  const vsLastYear = (current: number, ref: number, count = false) => comparison(current, ref, "vs. anul trecut", count);
  const preparePdf = async () => {
    setPdfBusy(true);
    try {
      const { buildCommissionPdf } = await import("@/lib/commissions-pdf");
      const currentRows = rows.filter(r => inRange(r.transaction_date, range));
      const blob = await buildCommissionPdf({ agency: agencyName, range, generatedAt: new Date().toLocaleString("ro-RO"), currency,
        filter: isAdmin ? `Agent: ${agent === ALL ? "Toți agenții" : names.get(agent) ?? "—"}` : "Comisioanele tale",
        current: cur, previous: prevK, lastYear: lyK, series, byKind, byType,
        agents: isAdmin ? byAgent.map(a => ({...a, agentAmount: reportKpis(currentRows.filter(r => r.agent_id === a.key), currency).agentEur})) : undefined });
      setPdf({ blob, filename: commissionFilename(range, agencyName, "pdf") });
    } catch(error) { toastError(error); } finally { setPdfBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CommissionCurrencySelect value={currency} onChange={onCurrencyChange} />
        <Button variant="outline" disabled={data.isFetching || !!data.error || pdfBusy || !orgId} onClick={() => void preparePdf()}><Download className="size-4" />{pdfBusy ? "Se pregătește…" : "Descarcă PDF"}</Button>
      </div>
      <Dialog open={!!pdf} onOpenChange={open => { if (!open) setPdf(null); }}><DialogContent><DialogHeader><DialogTitle>Raport pregătit</DialogTitle></DialogHeader><p className="break-all text-sm">{pdf?.filename}</p><Button onClick={() => { if (pdf) void deliverCommissionFile(pdf.blob, pdf.filename).catch(toastError); }}><Download className="size-4" />Descarcă PDF</Button></DialogContent></Dialog>
      {data.error ? <p role="alert" className="text-destructive">Nu am putut încărca raportul și cursurile BNR. <Button variant="outline" onClick={() => void data.refetch()}>Reîncearcă</Button></p> : null}
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
          {range.from} — {range.to} · {currency}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiWithLastYear label="Comision agenție" value={eur(cur.agencyEur)}
          trend={compareValue(cur.agencyEur, prevK.agencyEur).pct} previous={comparison(cur.agencyEur, prevK.agencyEur, "vs. perioada anterioară")}}
          lastYear={vsLastYear(cur.agencyEur, lyK.agencyEur)} loading={data.isLoading} />
        <KpiWithLastYear label="Suma agenților" value={eur(cur.agentEur)}
          trend={compareValue(cur.agentEur, prevK.agentEur).pct} previous={comparison(cur.agentEur, prevK.agentEur, "vs. perioada anterioară")}}
          lastYear={vsLastYear(cur.agentEur, lyK.agentEur)} loading={data.isLoading} />
        <KpiWithLastYear label="Tranzacții" value={String(cur.count)}
          trend={compareValue(cur.count, prevK.count).pct} previous={comparison(cur.count, prevK.count, "vs. perioada anterioară", true)}}
          lastYear={vsLastYear(cur.count, lyK.count, true)} loading={data.isLoading} />
        <KpiWithLastYear label="Comision mediu / tranzacție" value={eur(cur.avgEur)}
          trend={compareValue(cur.avgEur, prevK.avgEur).pct} previous={comparison(cur.avgEur, prevK.avgEur, "vs. perioada anterioară")}}
          lastYear={vsLastYear(cur.avgEur, lyK.avgEur)} loading={data.isLoading} />
        <KpiWithLastYear label="Încasat" value={eur(cur.collectedEur)} tone="success"
          trend={compareValue(cur.collectedEur, prevK.collectedEur).pct} previous={comparison(cur.collectedEur, prevK.collectedEur, "vs. perioada anterioară")}}
          lastYear={vsLastYear(cur.collectedEur, lyK.collectedEur)} loading={data.isLoading} />
        <KpiWithLastYear label="De încasat" value={eur(cur.pendingEur)} tone="warning"
          trend={compareValue(cur.pendingEur, prevK.pendingEur).pct} previous={comparison(cur.pendingEur, prevK.pendingEur, "vs. perioada anterioară")}}
          lastYear={vsLastYear(cur.pendingEur, lyK.pendingEur)} loading={data.isLoading} />
      </div>

      <SectionCard title="Evoluția pe luni" description={`Perioada aleasă comparată cu anul trecut (${currency})`}>
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
        <SectionCard title="Pe tip tranzacție" description={`Comisionul agenției (${currency})`}>
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

        <SectionCard title="Pe tip proprietate" description={`Comisionul agenției (${currency})`}>
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
          <SectionCard title="Clasament agenți" description={`Comisionul agenției pe agent (${currency})`}>
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
  previous,
  tone,
  loading,
}: {
  label: string;
  value: string;
  trend: number | null;
  lastYear: string;
  previous: string;
  tone?: "success" | "warning";
  loading: boolean;
}) {
  return (
    <div className="space-y-1">
      <KpiCard label={label} value={value} trend={trend} trendLabel="vs. perioada anterioară" tone={tone} loading={loading} />
      <p className="px-1 text-xs text-muted-foreground">{previous}</p>
      <p className="px-1 text-xs text-muted-foreground">{lastYear}</p>
    </div>
  );
}
