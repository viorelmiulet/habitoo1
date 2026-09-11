import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Building2, Download, Flame, Handshake, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/crm";
import { formatMoney } from "@/lib/format";
import { leadStageLabels, propertyStatusLabels, transactionLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/reports")({
  component: ReportsPage,
});

const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

type PeriodOption = "month" | "3months" | "6months" | "year" | "custom";

function periodBounds(period: PeriodOption, from: string, to: string) {
  const now = new Date();
  if (period === "custom" && from && to) return { start: new Date(from), end: new Date(to) };
  const end = now;
  const start = new Date(now);
  if (period === "month") start.setMonth(now.getMonth() - 1);
  else if (period === "3months") start.setMonth(now.getMonth() - 3);
  else if (period === "6months") start.setMonth(now.getMonth() - 6);
  else if (period === "year") start.setFullYear(now.getFullYear() - 1);
  return { start, end };
}

function weekKey(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function ReportsPage() {
  const [period, setPeriod] = useState<PeriodOption>("6months");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [agentId, setAgentId] = useState("all");
  const [source, setSource] = useState("all");
  const [txKind, setTxKind] = useState("all");

  const { data } = useQuery({
    queryKey: ["reports-data"],
    queryFn: async () => {
      const [properties, leads, activities, profiles] = await Promise.all([
        supabase
          .from("properties")
          .select(
            "id,status,price,currency,city,assigned_to,transaction_kind,created_at,updated_at,source",
          ),
        supabase.from("leads").select("id,stage,source,assigned_to,created_at,value"),
        supabase.from("activities").select("id,kind,done,status,assigned_to,starts_at"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      return {
        properties: properties.data ?? [],
        leads: leads.data ?? [],
        activities: activities.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  const { start, end } = periodBounds(period, from, to);
  const inRange = (d: string) => {
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };

  const properties = (data?.properties ?? []).filter(
    (p) =>
      (agentId === "all" || p.assigned_to === agentId) &&
      (txKind === "all" || p.transaction_kind === txKind),
  );
  const leads = (data?.leads ?? []).filter(
    (l) =>
      (agentId === "all" || l.assigned_to === agentId) && (source === "all" || l.source === source),
  );
  const activities = (data?.activities ?? []).filter(
    (a) => agentId === "all" || a.assigned_to === agentId,
  );

  const propertiesInPeriod = properties.filter((p) => inRange(p.created_at));
  const leadsInPeriod = leads.filter((l) => inRange(l.created_at));
  const activitiesInPeriod = activities.filter((a) => inRange(a.starts_at));

  const byStatus = Object.entries(
    properties.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({ name: propertyStatusLabels[k] ?? k, value: v }));

  const bySource = Object.entries(
    leadsInPeriod.reduce<Record<string, number>>((acc, l) => {
      const key = l.source ?? "necunoscut";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({ name: k, value: v }));

  const byStage = Object.entries(
    leadsInPeriod.reduce<Record<string, number>>((acc, l) => {
      acc[l.stage] = (acc[l.stage] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({ name: leadStageLabels[k] ?? k, leaduri: v }));

  const perAgent = (data?.profiles ?? []).map((p) => ({
    id: p.id,
    name: p.full_name?.split(" ")[0] ?? "Agent",
    proprietati: properties.filter((x) => x.assigned_to === p.id).length,
    leaduri: leads.filter((x) => x.assigned_to === p.id).length,
    activitati: activities.filter((x) => x.assigned_to === p.id).length,
    vizionari: activities.filter((x) => x.assigned_to === p.id && x.kind === "viewing").length,
    tranzactii: leads.filter((x) => x.assigned_to === p.id && x.stage === "won").length,
  }));

  const activityByWeek = useMemo(() => {
    const buckets = new Map<
      string,
      { week: string; apeluri: number; intalniri: number; vizionari: number; task: number }
    >();
    for (const a of activitiesInPeriod) {
      const k = weekKey(new Date(a.starts_at));
      if (!buckets.has(k))
        buckets.set(k, { week: k.slice(5), apeluri: 0, intalniri: 0, vizionari: 0, task: 0 });
      const b = buckets.get(k)!;
      if (a.kind === "call") b.apeluri += 1;
      else if (a.kind === "meeting") b.intalniri += 1;
      else if (a.kind === "viewing") b.vizionari += 1;
      else if (a.kind === "task") b.task += 1;
    }
    return [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  }, [activitiesInPeriod]);

  const won = leadsInPeriod.filter((l) => l.stage === "won").length;
  const lost = leadsInPeriod.filter((l) => l.stage === "lost").length;
  const qualified = leadsInPeriod.filter((l) =>
    ["qualified", "viewing", "offer", "negotiation", "transaction", "won"].includes(l.stage),
  ).length;
  const conversion = leadsInPeriod.length > 0 ? Math.round((won / leadsInPeriod.length) * 100) : 0;
  const sold = properties.filter((p) => p.status === "sold" && inRange(p.updated_at)).length;
  const rented = properties.filter((p) => p.status === "rented" && inRange(p.updated_at)).length;
  const expired = properties.filter((p) => p.status === "expired").length;
  const active = properties.filter((p) => p.status === "active").length;

  const sources = Array.from(
    new Set((data?.leads ?? []).map((l) => l.source).filter(Boolean)),
  ) as string[];

  return (
    <>
      <PageHeader
        title="Rapoarte"
        description="Performanța portofoliului, a lead-urilor și a echipei."
      />

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Perioadă</p>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Luna asta</SelectItem>
              <SelectItem value="3months">Ultimele 3 luni</SelectItem>
              <SelectItem value="6months">Ultimele 6 luni</SelectItem>
              <SelectItem value="year">Anul</SelectItem>
              <SelectItem value="custom">Interval custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" ? (
          <>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">De la</p>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Până la</p>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        ) : null}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Agent</p>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toți agenții</SelectItem>
              {(data?.profiles ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Sursă</p>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Tip tranzacție</p>
          <Select value={txKind} onValueChange={setTxKind}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              {Object.entries(transactionLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Proprietăți active"
          value={active}
          hint={`${propertiesInPeriod.length} noi în perioadă`}
          icon={Building2}
        />
        <KpiCard
          label="Lead-uri noi"
          value={leadsInPeriod.length}
          tone="accent"
          hint={`${qualified} calificate`}
          icon={Flame}
        />
        <KpiCard
          label="Rată conversie"
          value={`${conversion}%`}
          hint={`${won} câștigate · ${lost} pierdute`}
          tone="success"
          icon={TrendingUp}
        />
        <KpiCard
          label="Vândute / Închiriate"
          value={`${sold} / ${rented}`}
          hint={`${expired} expirate`}
          tone="info"
          icon={Handshake}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Proprietăți după status</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("proprietati-status.csv", byStatus)}
            >
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                >
                  {byStatus.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Legend />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Lead-uri după sursă</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("leaduri-sursa.csv", bySource)}
            >
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bySource}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                >
                  {bySource.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Legend />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Funnel lead-uri pe etape</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("leaduri-etape.csv", byStage)}
            >
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  horizontal={false}
                />
                <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="leaduri"
                  name="Lead-uri"
                  fill="var(--color-chart-1)"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Activitate pe săptămâni</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("activitate-saptamani.csv", activityByWeek)}
            >
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityByWeek}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis dataKey="week" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="apeluri"
                  name="Apeluri"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="intalniri"
                  name="Întâlniri"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="vizionari"
                  name="Vizionări"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="task"
                  name="Task-uri"
                  stroke="var(--color-chart-4)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Activitatea agenților</h2>
            <p className="text-xs text-muted-foreground">
              Comparativ pe perioada și filtrele selectate.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => downloadCsv("agenti.csv", perAgent)}>
            <Download className="size-3.5" /> CSV
          </Button>
        </div>
        {perAgent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nu există agenți în agenție pentru intervalul selectat.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-surface">
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Proprietăți</TableHead>
                <TableHead className="text-right">Lead-uri</TableHead>
                <TableHead className="text-right">Vizionări</TableHead>
                <TableHead className="text-right">Activități</TableHead>
                <TableHead className="text-right">Tranzacții</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perAgent.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {a.name.slice(0, 2).toUpperCase()}
                      </span>
                      {a.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.proprietati}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.leaduri}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.vizionari}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.activitati}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {a.tranzactii}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
