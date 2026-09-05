import { createFileRoute } from "@tanstack/react-router";
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
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { leadStageLabels, propertyStatusLabels } from "@/lib/labels";

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

function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [properties, leads, activities, profiles] = await Promise.all([
        supabase.from("properties").select("status,price,currency,city,assigned_to,transaction_kind"),
        supabase.from("leads").select("stage,source,assigned_to"),
        supabase.from("activities").select("kind,done,assigned_to"),
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

  const properties = data?.properties ?? [];
  const leads = data?.leads ?? [];
  const activities = data?.activities ?? [];

  const byStatus = Object.entries(
    properties.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({ name: propertyStatusLabels[k] ?? k, value: v }));

  const bySource = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      const key = l.source ?? "necunoscut";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({ name: k, leaduri: v }));

  const byStage = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.stage] = (acc[l.stage] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([k, v]) => ({ name: leadStageLabels[k] ?? k, leaduri: v }));

  const perAgent = (data?.profiles ?? []).map((p) => ({
    name: p.full_name?.split(" ")[0] ?? "Agent",
    proprietati: properties.filter((x) => x.assigned_to === p.id).length,
    leaduri: leads.filter((x) => x.assigned_to === p.id).length,
    activitati: activities.filter((x) => x.assigned_to === p.id).length,
  }));

  const won = leads.filter((l) => l.stage === "won").length;
  const conversion = leads.length > 0 ? Math.round((won / leads.length) * 100) : 0;
  const portfolio = properties
    .filter((p) => p.transaction_kind === "sale")
    .reduce((s, p) => s + Number(p.price ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Rapoarte"
        description="Performanța portofoliului, a lead-urilor și a echipei."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Proprietăți totale" value={properties.length} />
        <KpiCard label="Lead-uri totale" value={leads.length} tone="accent" />
        <KpiCard label="Rată conversie" value={`${conversion}%`} hint={`${won} câștigate`} tone="success" />
        <KpiCard label="Valoare portofoliu" value={formatMoney(portfolio, "EUR")} tone="info" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Proprietăți după status</h2>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}>
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
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Lead-uri după sursă</h2>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySource}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="leaduri" name="Lead-uri" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Pipeline pe etape</h2>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="leaduri" name="Lead-uri" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Activitate pe agent</h2>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perAgent}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
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
                <Bar dataKey="proprietati" name="Proprietăți" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="leaduri" name="Lead-uri" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="activitati" name="Activități" fill="var(--color-chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
