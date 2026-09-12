import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Pencil,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CardGridSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { goalMetricLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/format";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/goals")({
  head: () => appHead("Habitoo CRM — obiective"),
  component: GoalsPage,
});

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, 1);
  const end = new Date(y, m ?? 1, 1);
  return { start, end };
}

function GoalsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["goals-data"],
    queryFn: async () => {
      const [goals, profiles, properties, leads, activities] = await Promise.all([
        supabase.from("goals").select("*").order("period", { ascending: false }),
        supabase.from("profiles").select("id,full_name"),
        supabase.from("properties").select("id,created_at,assigned_to"),
        supabase.from("leads").select("id,created_at,assigned_to,stage,value"),
        supabase.from("activities").select("id,starts_at,assigned_to,kind"),
      ]);
      if (goals.error) throw goals.error;
      return {
        goals: goals.data ?? [],
        profiles: profiles.data ?? [],
        properties: properties.data ?? [],
        leads: leads.data ?? [],
        activities: activities.data ?? [],
      };
    },
  });

  const [form, setForm] = useState({
    metric: "leads",
    target: "10",
    period: currentPeriod(),
    user_id: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      if (editing) {
        const { error } = await supabase
          .from("goals")
          .update({
            metric: form.metric,
            target: Number(form.target) || 0,
            period: form.period,
            user_id: form.user_id || null,
          })
          .eq("id", editing);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("goals").insert({
        organization_id: user.organization.id,
        created_by: user.userId,
        metric: form.metric,
        target: Number(form.target) || 0,
        period: form.period,
        user_id: form.user_id || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals-data"] });
      setOpen(false);
      setEditing(null);
      toast.success(editing ? "Obiectivul a fost actualizat." : "Obiectivul a fost creat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals-data"] });
      toast.success("Obiectivul a fost șters.");
    },
    onError: (e: Error) => toastError(e),
  });

  const updateProgress = useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      const { error } = await supabase.from("goals").update({ progress }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals-data"] }),
    onError: (e: Error) => toastError(e),
  });

  const allGoals = data?.goals ?? [];
  const goals = useMemo(
    () =>
      user?.isAdmin ? allGoals : allGoals.filter((g) => g.user_id === user?.userId || !g.user_id),
    [allGoals, user],
  );

  const nameFor = (id: string | null) =>
    id ? (data?.profiles.find((p) => p.id === id)?.full_name ?? "Agent") : "Toată agenția";

  function realizedFor(goal: (typeof allGoals)[number]) {
    const { start, end } = periodRange(goal.period);
    const inRange = (d: string) => {
      const t = new Date(d).getTime();
      return t >= start.getTime() && t < end.getTime();
    };
    const filterUser = (assigned: string | null) => !goal.user_id || assigned === goal.user_id;
    switch (goal.metric) {
      case "new_properties":
        return (data?.properties ?? []).filter(
          (p) => inRange(p.created_at) && filterUser(p.assigned_to),
        ).length;
      case "leads":
        return (data?.leads ?? []).filter((l) => inRange(l.created_at) && filterUser(l.assigned_to))
          .length;
      case "viewings":
        return (data?.activities ?? []).filter(
          (a) => a.kind === "viewing" && inRange(a.starts_at) && filterUser(a.assigned_to),
        ).length;
      case "transactions":
        return (data?.leads ?? []).filter(
          (l) => l.stage === "won" && inRange(l.created_at) && filterUser(l.assigned_to),
        ).length;
      case "commission":
        return (data?.leads ?? [])
          .filter((l) => l.stage === "won" && inRange(l.created_at) && filterUser(l.assigned_to))
          .reduce((s, l) => s + Number(l.value ?? 0), 0);
      default:
        return 0;
    }
  }

  const computed = goals.map((g) => {
    const realized = realizedFor(g);
    const target = Number(g.target);
    const pct = target > 0 ? Math.min(100, Math.round((realized / target) * 100)) : 0;
    return { goal: g, realized, target, pct };
  });

  const byPeriod = (() => {
    const map = new Map<string, typeof computed>();
    for (const row of computed) {
      const list = map.get(row.goal.period) ?? [];
      list.push(row);
      map.set(row.goal.period, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  const done = computed.filter((c) => c.pct >= 100).length;
  const risk = computed.filter((c) => c.pct < 50).length;
  const average =
    computed.length > 0 ? Math.round(computed.reduce((s, c) => s + c.pct, 0) / computed.length) : 0;

  const toneFor = (pct: number) =>
    pct >= 100 ? "success" : pct >= 50 ? "primary" : ("warning" as const);

  return (
    <>
      <PageHeader
        title="Obiective"
        description="Ținte lunare pe agenție și pe agent, cu progres calculat din date reale."
        meta={
          computed.length > 0 ? (
            <>
              <StatusBadge tone="neutral">{computed.length} obiective</StatusBadge>
              <StatusBadge tone="success" dot>
                {done} îndeplinite
              </StatusBadge>
            </>
          ) : undefined
        }
        actions={
          user?.isAdmin ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm({ metric: "leads", target: "10", period: currentPeriod(), user_id: "" });
                setOpen(true);
              }}
            >
              Adaugă obiectiv
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : computed.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Layers}
            title="Niciun obiectiv definit"
            description="Adminul agenției poate defini ținte lunare pentru echipă."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Obiective active" value={computed.length} icon={Target} />
            <KpiCard
              label="Realizare medie"
              value={`${average}%`}
              icon={TrendingUp}
              tone="accent"
            />
            <KpiCard label="Îndeplinite" value={done} icon={CheckCircle2} tone="success" />
            <KpiCard label="Sub 50%" value={risk} icon={AlertTriangle} tone="warning" />
          </div>

          {byPeriod.map(([period, items]) => (
            <section key={period} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold">{period}</h2>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs text-muted-foreground">{items.length} obiective</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map(({ goal: g, realized, target, pct }) => {
                  const isCommission = g.metric === "commission";
                  const tone = toneFor(pct);
                  return (
                    <div key={g.id} className="panel space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                              tone === "success"
                                ? "bg-success/12 text-success"
                                : tone === "warning"
                                  ? "bg-warning/18 text-warning-foreground"
                                  : "bg-primary/10 text-primary"
                            }`}
                          >
                            <Target className="size-5" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {goalMetricLabels[g.metric] ?? g.metric}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {nameFor(g.user_id)}
                            </p>
                          </div>
                        </div>
                        <StatusBadge tone={tone}>{pct}%</StatusBadge>
                      </div>

                      <div className="space-y-2">
                        <Progress value={pct} className="h-2" />
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="font-medium tabular-nums">
                            {isCommission ? formatMoney(realized, "EUR") : realized}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            din {isCommission ? formatMoney(target, "EUR") : target}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span>Progres manual: {Number(g.progress)}</span>
                        {user?.isAdmin ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              className="h-8 w-20"
                              defaultValue={Number(g.progress)}
                              onBlur={(e) =>
                                updateProgress.mutate({
                                  id: g.id,
                                  progress: Number(e.target.value) || 0,
                                })
                              }
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label="Editează obiectivul"
                              title="Editează obiectivul"
                              onClick={() => {
                                setEditing(g.id);
                                setForm({
                                  metric: g.metric,
                                  target: String(g.target),
                                  period: g.period,
                                  user_id: g.user_id ?? "",
                                });
                                setOpen(true);
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive"
                              aria-label="Șterge obiectivul"
                              title="Șterge obiectivul"
                              onClick={() => setDeleteTarget(g.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editează obiectivul" : "Obiectiv nou"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Indicator</Label>
              <Select
                value={form.metric}
                onValueChange={(v) => setForm((f) => ({ ...f, metric: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(goalMetricLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target">Țintă</Label>
                <Input
                  id="target"
                  type="number"
                  required
                  value={form.target}
                  onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Perioadă (AAAA-LL)</Label>
                <Input
                  id="period"
                  required
                  value={form.period}
                  onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Atribuit</Label>
              <Select
                value={form.user_id || "org"}
                onValueChange={(v) => setForm((f) => ({ ...f, user_id: v === "org" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Toată agenția</SelectItem>
                  {(data?.profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Renunță
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Salvează
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Ștergi acest obiectiv?"
        description="Obiectivul și progresul înregistrat vor fi eliminate definitiv."
        confirmLabel="Șterge"
        destructive
        onConfirm={() => (deleteTarget ? remove.mutateAsync(deleteTarget) : undefined)}
      />
    </>
  );
}
