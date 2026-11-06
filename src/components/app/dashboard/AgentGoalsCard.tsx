/** Obiectivele lunii curente ale agentului (proprii și ale agenției), pe ecranul de start. */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/app/SectionCard";
import { EmptyState } from "@/components/app/EmptyState";
import { InlineLoading } from "@/components/app/LoadingState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { goalMetricLabels } from "@/lib/labels";
import { currentPeriod, goalPercent, goalRealized, periodRange } from "@/lib/goals-progress";

export function AgentGoalsCard({ userId }: { userId: string | undefined }) {
  const period = currentPeriod();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-dashboard-goals", userId, period],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { start, end } = periodRange(period);
      const from = start.toISOString();
      const to = end.toISOString();
      const [goals, properties, leads, activities] = await Promise.all([
        supabase.from("goals").select("id,metric,period,user_id,target").eq("period", period).or(`user_id.eq.${userId},user_id.is.null`),
        supabase.from("properties").select("created_at,assigned_to").gte("created_at", from).lt("created_at", to),
        supabase.from("leads").select("created_at,assigned_to,stage,value").gte("created_at", from).lt("created_at", to),
        supabase.from("activities").select("starts_at,assigned_to,kind").eq("kind", "viewing").gte("starts_at", from).lt("starts_at", to),
      ]);
      if (goals.error) throw goals.error;
      const rows = { properties: properties.data ?? [], leads: leads.data ?? [], activities: activities.data ?? [] };
      return (goals.data ?? []).map((g) => {
        const realized = goalRealized(g, rows);
        const target = Number(g.target);
        return { id: g.id, label: goalMetricLabels[g.metric] ?? g.metric, mine: Boolean(g.user_id), realized, target, pct: goalPercent(realized, target), commission: g.metric === "commission" };
      });
    },
  });

  return (
    <SectionCard
      title="Obiectivele lunii"
      description="Progres calculat din activitatea ta în aplicație"
      icon={Target}
      action={
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/goals">Vezi obiectivele</Link>
        </Button>
      }
    >
      {isLoading ? (
        <InlineLoading />
      ) : !data?.length ? (
        <EmptyState icon={Target} compact title="Niciun obiectiv luna aceasta" description="Obiectivele stabilite pentru tine sau pentru agenție apar aici, cu progresul lor." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.map((g) => (
            <li key={g.id} className="rounded-xl border border-border px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {g.label} <span className="text-xs text-muted-foreground">· {g.mine ? "al tău" : "agenția"}</span>
                </p>
                <p className="shrink-0 text-sm tabular-nums">
                  {g.commission ? Math.round(g.realized).toLocaleString("ro-RO") : g.realized} / {g.commission ? g.target.toLocaleString("ro-RO") : g.target}
                </p>
              </div>
              <Progress value={g.pct} className="mt-2 h-2" aria-label={`${g.label}: ${g.pct}%`} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
