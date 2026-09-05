import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  CalendarClock,
  Flame,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime, formatMoney, relativeDays } from "@/lib/format";
import {
  activityKindLabels,
  goalMetricLabels,
  leadStageLabels,
  propertyStatusLabels,
  propertyStatusTone,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/")({
  component: DashboardPage,
});

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function DashboardPage() {
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;

  const { data } = useQuery({
    queryKey: ["dashboard", orgId, user?.userId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [properties, leads, requests, activities, contacts, goals] = await Promise.all([
        supabase
          .from("properties")
          .select("id,title,status,price,currency,city,created_at,updated_at,transaction_kind,assigned_to")
          .order("created_at", { ascending: false }),
        supabase
          .from("leads")
          .select("id,name,stage,score,source,created_at,last_interaction_at,next_followup_at,assigned_to")
          .order("created_at", { ascending: false }),
        supabase.from("requests").select("id,title,status,priority,created_at,assigned_to"),
        supabase
          .from("activities")
          .select("id,title,kind,starts_at,done,assigned_to")
          .order("starts_at", { ascending: true })
          .limit(50),
        supabase.from("contacts").select("id,created_at"),
        supabase.from("goals").select("*"),
      ]);
      return {
        properties: properties.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        activities: activities.data ?? [],
        contacts: contacts.data ?? [],
        goals: goals.data ?? [],
      };
    },
  });

  const isAgentView = user?.role === "agent";
  const mine = <T extends { assigned_to: string | null }>(rows: T[]) =>
    isAgentView ? rows.filter((r) => r.assigned_to === user?.userId) : rows;

  const properties = mine(data?.properties ?? []);
  const leads = mine(data?.leads ?? []);
  const requests = mine(data?.requests ?? []);
  const activities = mine(data?.activities ?? []);

  const activeProperties = properties.filter((p) => p.status === "active").length;
  const newLeads = leads.filter((l) => l.stage === "new").length;
  const upcomingViewings = activities.filter(
    (a) => a.kind === "viewing" && !a.done && new Date(a.starts_at) >= new Date(),
  );
  const todayActivities = activities.filter(
    (a) => new Date(a.starts_at).toDateString() === new Date().toDateString(),
  );
  const staleLeads = leads.filter(
    (l) =>
      !["won", "lost"].includes(l.stage) &&
      (!l.last_interaction_at ||
        Date.now() - new Date(l.last_interaction_at).getTime() > 3 * 86_400_000),
  );
  const portfolioValue = properties
    .filter((p) => p.transaction_kind === "sale" && p.status === "active")
    .reduce((sum, p) => sum + Number(p.price ?? 0), 0);

  const chartData = (() => {
    const buckets = new Map<string, { month: string; proprietati: number; leaduri: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      buckets.set(monthKey(d), {
        month: d.toLocaleDateString("ro-RO", { month: "short" }),
        proprietati: 0,
        leaduri: 0,
      });
    }
    for (const p of properties) {
      const k = monthKey(new Date(p.created_at));
      const b = buckets.get(k);
      if (b) b.proprietati += 1;
    }
    for (const l of leads) {
      const k = monthKey(new Date(l.created_at));
      const b = buckets.get(k);
      if (b) b.leaduri += 1;
    }
    return [...buckets.values()];
  })();

  const myGoals = (data?.goals ?? []).filter((g) => !isAgentView || g.user_id === user?.userId);

  return (
    <>
      <PageHeader
        title={`Salut, ${user?.profile?.full_name?.split(" ")[0] ?? "bun venit"}`}
        description={
          isAgentView
            ? "Activitatea ta de azi, lead-urile și proprietățile tale."
            : "Imaginea completă a agenției: portofoliu, lead-uri, activitate și obiective."
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/matching">Vezi potriviri</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/properties/new">Adaugă proprietate</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isAgentView ? "Proprietățile mele" : "Proprietăți active"}
          value={activeProperties}
          hint={`${properties.length} în portofoliu`}
          icon={Building2}
        />
        <KpiCard
          label="Lead-uri noi"
          value={newLeads}
          hint={`${leads.length} lead-uri în total`}
          icon={Flame}
          tone="accent"
        />
        <KpiCard
          label="Cereri active"
          value={requests.filter((r) => r.status === "active").length}
          hint={`${requests.length} cereri înregistrate`}
          icon={Target}
          tone="info"
        />
        <KpiCard
          label="Valoare portofoliu"
          value={formatMoney(portfolioValue, "EUR")}
          hint="Proprietăți active la vânzare"
          icon={TrendingUp}
          tone="success"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="panel xl:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Evoluție ultimele 6 luni</h2>
              <p className="text-xs text-muted-foreground">Proprietăți adăugate și lead-uri primite</p>
            </div>
          </div>
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gProps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} />
                <ReTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="proprietati"
                  name="Proprietăți"
                  stroke="var(--color-chart-1)"
                  fill="url(#gProps)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="leaduri"
                  name="Lead-uri"
                  stroke="var(--color-chart-2)"
                  fill="url(#gLeads)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Obiective luna curentă</h2>
            <p className="text-xs text-muted-foreground">Progres în timp real</p>
          </div>
          <div className="space-y-4 px-5 py-4">
            {myGoals.length === 0 ? (
              <EmptyState icon={Target} title="Nu există obiective" description="Adminul le poate defini în secțiunea Obiective." />
            ) : (
              myGoals.slice(0, 5).map((g) => {
                const pct = g.target > 0 ? Math.min(100, Math.round((Number(g.progress) / Number(g.target)) * 100)) : 0;
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{goalMetricLabels[g.metric] ?? g.metric}</span>
                      <span className="text-muted-foreground">
                        {Number(g.progress)} / {Number(g.target)}
                      </span>
                    </div>
                    <Progress value={pct} className="mt-2 h-2" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Agenda de azi</h2>
            <Link to="/app/calendar" className="text-xs text-primary hover:underline">
              Calendar
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {todayActivities.length === 0 ? (
              <li>
                <EmptyState icon={CalendarClock} title="Nicio activitate azi" />
              </li>
            ) : (
              todayActivities.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <StatusBadge tone="primary">{activityKindLabels[a.kind]}</StatusBadge>
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Lead-uri fără activitate 3+ zile</h2>
            <Link to="/app/leads" className="text-xs text-primary hover:underline">
              Pipeline
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {staleLeads.length === 0 ? (
              <li>
                <EmptyState icon={Flame} title="Toate lead-urile sunt urmărite" />
              </li>
            ) : (
              staleLeads.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.name || "Lead"}</span>
                  <StatusBadge tone="warning">{leadStageLabels[l.stage]}</StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {relativeDays(l.last_interaction_at)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Vizionări viitoare</h2>
            <Link to="/app/activities" className="text-xs text-primary hover:underline">
              Activități
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {upcomingViewings.length === 0 ? (
              <li>
                <EmptyState icon={Users} title="Nicio vizionare programată" />
              </li>
            ) : (
              upcomingViewings.slice(0, 6).map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p className="truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Proprietăți recente</h2>
          <Link to="/app/properties" className="text-xs text-primary hover:underline">
            Vezi toate
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {properties.slice(0, 6).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <Link
                to="/app/properties/$id"
                params={{ id: p.id }}
                className="min-w-0 flex-1 truncate font-medium hover:text-primary"
              >
                {p.title}
              </Link>
              <span className="text-xs text-muted-foreground">{p.city ?? "—"}</span>
              <StatusBadge tone={propertyStatusTone[p.status]}>
                {propertyStatusLabels[p.status]}
              </StatusBadge>
              <span className="w-28 text-right font-medium">{formatMoney(p.price, p.currency)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
