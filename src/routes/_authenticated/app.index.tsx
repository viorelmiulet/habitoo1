import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
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
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { scoreMatch, matchTone, matchLabel } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/app/")({
  component: DashboardPage,
});

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type AttentionRow = {
  id: string;
  label: string;
  detail: string;
  tone: "warning" | "danger" | "info" | "neutral";
  to: string;
  params?: Record<string, string>;
  quickActivity?: { kind: "call" | "viewing" | "task"; title: string; contactId?: string; propertyId?: string; leadId?: string; requestId?: string };
};

function DashboardPage() {
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const [scope, setScope] = useState<"agency" | "mine">(user?.isAdmin ? "agency" : "mine");
  const [sortKey, setSortKey] = useState<"leads" | "viewings" | "properties" | "deals" | "commission">("deals");
  const [activityDefaults, setActivityDefaults] = useState<{ kind?: "call" | "viewing" | "task"; title?: string; contactId?: string; propertyId?: string; leadId?: string; requestId?: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["dashboard", orgId, user?.userId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [properties, leads, requests, activities, profiles, goals] = await Promise.all([
        supabase
          .from("properties")
          .select("id,title,status,price,currency,city,created_at,updated_at,last_activity_at,transaction_kind,assigned_to")
          .order("created_at", { ascending: false }),
        supabase
          .from("leads")
          .select("id,name,stage,score,source,created_at,last_interaction_at,next_followup_at,assigned_to,value")
          .order("created_at", { ascending: false }),
        supabase.from("requests").select("*").order("created_at", { ascending: false }),
        supabase
          .from("activities")
          .select("id,title,kind,starts_at,done,status,assigned_to,property_id,contact_id,lead_id,request_id")
          .order("starts_at", { ascending: true })
          .limit(200),
        supabase.from("profiles").select("id,full_name"),
        supabase.from("goals").select("*"),
      ]);
      return {
        properties: properties.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        activities: activities.data ?? [],
        profiles: profiles.data ?? [],
        goals: goals.data ?? [],
      };
    },
  });

  const isAdmin = Boolean(user?.isAdmin);
  const isAgentView = !isAdmin || scope === "mine";
  const mine = <T extends { assigned_to: string | null }>(rows: T[]) =>
    isAgentView ? rows.filter((r) => r.assigned_to === user?.userId) : rows;

  const properties = mine(data?.properties ?? []);
  const leads = mine(data?.leads ?? []);
  const requests = mine(data?.requests ?? []);
  const activities = mine(data?.activities ?? []);

  const now = new Date();
  const activeProperties = properties.filter((p) => p.status === "active").length;
  const newLeads = leads.filter((l) => l.stage === "new").length;
  const activeRequests = requests.filter((r) => r.status === "active" || r.status === "new").length;
  const todayViewings = activities.filter(
    (a) => a.kind === "viewing" && new Date(a.starts_at).toDateString() === now.toDateString(),
  );
  const overdueTasks = activities.filter(
    (a) => (a.status ?? (a.done ? "done" : "planned")) === "planned" && new Date(a.starts_at) < now,
  );
  const followupsTodayTomorrow = leads.filter((l) => {
    if (!l.next_followup_at) return false;
    const d = new Date(l.next_followup_at);
    const diffDays = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 1;
  });

  const attentionRows: AttentionRow[] = useMemo(() => {
    const rows: AttentionRow[] = [];
    for (const l of leads) {
      if (["won", "lost"].includes(l.stage)) continue;
      const overdue = l.next_followup_at && new Date(l.next_followup_at) < now;
      const missing = !l.next_followup_at && !l.last_interaction_at;
      if (overdue) {
        rows.push({
          id: `lead-overdue-${l.id}`,
          label: l.name || "Lead",
          detail: `Follow-up depășit · ${relativeDays(l.next_followup_at)}`,
          tone: "danger",
          to: "/app/leads",
          quickActivity: { kind: "call", title: `Follow-up ${l.name}`, leadId: l.id },
        });
      } else if (missing) {
        rows.push({
          id: `lead-missing-${l.id}`,
          label: l.name || "Lead",
          detail: "Fără follow-up programat",
          tone: "warning",
          to: "/app/leads",
          quickActivity: { kind: "call", title: `Follow-up ${l.name}`, leadId: l.id },
        });
      }
    }
    for (const a of todayViewings) {
      rows.push({
        id: `viewing-${a.id}`,
        label: a.title,
        detail: `Vizionare azi · ${formatDateTime(a.starts_at)}`,
        tone: "info",
        to: "/app/activities",
      });
    }
    for (const r of requests) {
      if (r.status === "new") {
        rows.push({
          id: `request-${r.id}`,
          label: r.title,
          detail: "Cerere nouă neatinsă",
          tone: "warning",
          to: "/app/requests",
        });
      }
    }
    for (const p of properties) {
      const lastActivity = p.last_activity_at ?? p.updated_at;
      const stale = Date.now() - new Date(lastActivity).getTime() > 7 * 86_400_000;
      if (stale && p.status === "active") {
        rows.push({
          id: `property-${p.id}`,
          label: p.title,
          detail: `Fără activitate ${relativeDays(lastActivity)}`,
          tone: "neutral",
          to: "/app/properties/$id",
          params: { id: p.id },
          quickActivity: { kind: "call", title: `Update ${p.title}`, propertyId: p.id },
        });
      }
    }
    for (const a of overdueTasks) {
      rows.push({
        id: `task-${a.id}`,
        label: a.title,
        detail: `Task restant · ${formatDateTime(a.starts_at)}`,
        tone: "danger",
        to: "/app/activities",
      });
    }
    return rows.slice(0, 12);
  }, [leads, todayViewings, requests, properties, overdueTasks, now]);

  const todayActivities = activities.filter(
    (a) => new Date(a.starts_at).toDateString() === now.toDateString(),
  );

  const myGoals = (data?.goals ?? []).filter((g) => !isAgentView || g.user_id === user?.userId);

  const myRequests = (data?.requests ?? []).filter((r) => r.assigned_to === user?.userId && (r.status === "active" || r.status === "new"));
  const allProperties = data?.properties ?? [];
  const myMatches = useMemo(() => {
    return myRequests
      .flatMap((request) =>
        allProperties
          .filter((p) => ["active", "reserved", "negotiation"].includes(p.status))
          .map((property) => ({ request, property, match: scoreMatch(request, property) })),
      )
      .filter((m) => m.match.score >= 70)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 5);
  }, [myRequests, allProperties]);

  const chartData = (() => {
    const buckets = new Map<string, { month: string; proprietati: number; leaduri: number; tranzactii: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      buckets.set(monthKey(d), {
        month: d.toLocaleDateString("ro-RO", { month: "short" }),
        proprietati: 0,
        leaduri: 0,
        tranzactii: 0,
      });
    }
    for (const p of data?.properties ?? []) {
      const b = buckets.get(monthKey(new Date(p.created_at)));
      if (b) b.proprietati += 1;
    }
    for (const l of data?.leads ?? []) {
      const b = buckets.get(monthKey(new Date(l.created_at)));
      if (b) b.leaduri += 1;
      if (l.stage === "won") {
        const bw = buckets.get(monthKey(new Date(l.created_at)));
        if (bw) bw.tranzactii += 1;
      }
    }
    return [...buckets.values()];
  })();

  const leaderboard = useMemo(() => {
    if (!isAdmin) return [];
    const allLeads = data?.leads ?? [];
    const allActivities = data?.activities ?? [];
    const allProps = data?.properties ?? [];
    return (data?.profiles ?? []).map((p) => {
      const agentLeads = allLeads.filter((l) => l.assigned_to === p.id);
      const wonLeads = agentLeads.filter((l) => l.stage === "won");
      const commission = wonLeads.reduce((s, l) => s + Number(l.value ?? 0), 0);
      return {
        id: p.id,
        name: p.full_name ?? "Agent",
        leads: agentLeads.length,
        viewings: allActivities.filter((a) => a.assigned_to === p.id && a.kind === "viewing").length,
        properties: allProps.filter((x) => x.assigned_to === p.id).length,
        deals: wonLeads.length,
        commission,
      };
    }).sort((a, b) => b[sortKey] - a[sortKey]);
  }, [isAdmin, data, sortKey]);

  const totalWon = (data?.leads ?? []).filter((l) => l.stage === "won").length;
  const totalConversion = (data?.leads ?? []).length > 0 ? Math.round((totalWon / (data?.leads ?? []).length) * 100) : 0;

  const sortHeader = (key: typeof sortKey, label: string) => (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => setSortKey(key)}
    >
      {label} {sortKey === key ? "▾" : ""}
    </TableHead>
  );

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
            {isAdmin ? (
              <div className="flex overflow-hidden rounded-lg border border-border">
                <button
                  className={`px-3 py-1.5 text-xs font-medium ${scope === "agency" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  onClick={() => setScope("agency")}
                  type="button"
                >
                  Agenție
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium ${scope === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  onClick={() => setScope("mine")}
                  type="button"
                >
                  Ale mele
                </button>
              </div>
            ) : null}
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
          value={activeRequests}
          hint={`${requests.length} cereri înregistrate`}
          icon={Target}
          tone="info"
        />
        <KpiCard
          label="Vizionări azi"
          value={todayViewings.length}
          hint={`${overdueTasks.length} task-uri restante`}
          icon={CalendarClock}
          tone="success"
        />
      </div>

      {isAdmin && scope === "agency" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Tranzacții câștigate" value={totalWon} icon={TrendingUp} tone="success" />
          <KpiCard label="Rată conversie" value={`${totalConversion}%`} icon={Target} tone="info" />
          <KpiCard label="Follow-up azi/mâine" value={followupsTodayTomorrow.length} icon={Flame} tone="accent" />
          <KpiCard label="Obiective active" value={(data?.goals ?? []).length} icon={Users} />
        </div>
      ) : null}

      <div className="panel">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Necesită atenția ta</h2>
            <p className="text-xs text-muted-foreground">Priorități calculate din datele reale</p>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {attentionRows.length === 0 ? (
            <li>
              <EmptyState icon={AlertTriangle} title="Nimic urgent momentan" description="Totul este sub control." />
            </li>
          ) : (
            attentionRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <StatusBadge tone={row.tone}>{row.detail}</StatusBadge>
                <Link
                  to={row.to}
                  params={row.params as never}
                  className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                >
                  {row.label}
                </Link>
                {row.quickActivity ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setActivityDefaults(row.quickActivity ?? null)
                    }
                  >
                    Adaugă activitate
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="panel xl:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Evoluție ultimele 6 luni</h2>
              <p className="text-xs text-muted-foreground">Proprietăți, lead-uri și tranzacții</p>
            </div>
          </div>
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
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
                <Bar dataKey="proprietati" name="Proprietăți" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="leaduri" name="Lead-uri" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="tranzactii" name="Tranzacții" fill="var(--color-chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Obiectivele mele</h2>
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

      {isAdmin && scope === "agency" ? (
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Leaderboard agenți</h2>
            <p className="text-xs text-muted-foreground">Click pe o coloană pentru sortare</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                {sortHeader("leads", "Lead-uri")}
                {sortHeader("viewings", "Vizionări")}
                {sortHeader("properties", "Proprietăți")}
                {sortHeader("deals", "Tranzacții")}
                {sortHeader("commission", "Comision")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.leads}</TableCell>
                  <TableCell>{row.viewings}</TableCell>
                  <TableCell>{row.properties}</TableCell>
                  <TableCell>{row.deals}</TableCell>
                  <TableCell>{formatMoney(row.commission, "EUR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

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
            <h2 className="text-sm font-semibold">Potriviri noi</h2>
            <Link to="/app/matching" className="text-xs text-primary hover:underline">
              Vezi toate
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {myMatches.length === 0 ? (
              <li>
                <EmptyState icon={Flame} title="Nicio potrivire nouă" />
              </li>
            ) : (
              myMatches.map(({ request, property, match }, i) => (
                <li key={`${request.id}-${property.id}-${i}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Link to="/app/properties/$id" params={{ id: property.id }} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                    {property.title}
                  </Link>
                  <StatusBadge tone={matchTone(match.score)}>
                    {match.score}% · {matchLabel(match.score)}
                  </StatusBadge>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Lead-uri fără follow-up</h2>
            <Link to="/app/leads" className="text-xs text-primary hover:underline">
              Pipeline
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {leads.filter((l) => !["won", "lost"].includes(l.stage)).slice(0, 6).length === 0 ? (
              <li>
                <EmptyState icon={Flame} title="Toate lead-urile sunt urmărite" />
              </li>
            ) : (
              leads
                .filter((l) => !["won", "lost"].includes(l.stage))
                .slice(0, 6)
                .map((l) => (
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

      <ActivityDialog
        open={Boolean(activityDefaults)}
        onOpenChange={(v) => !v && setActivityDefaults(null)}
        orgId={orgId}
        userId={user?.userId}
        defaults={activityDefaults ?? undefined}
      />
    </>
  );
}
