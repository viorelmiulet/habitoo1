import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
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

export const Route = createFileRoute("/_authenticated/app/goals")({
  component: GoalsPage,
});

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function GoalsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const [goals, profiles] = await Promise.all([
        supabase.from("goals").select("*").order("period", { ascending: false }),
        supabase.from("profiles").select("id,full_name"),
      ]);
      if (goals.error) throw goals.error;
      return { goals: goals.data, profiles: profiles.data ?? [] };
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
      const { error } = await supabase.from("goals").insert({
        organization_id: user.organization.id,
        created_by: user.userId,
        metric: form.metric,
        target: Number(form.target) || 0,
        period: form.period,
        user_id: form.user_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      setOpen(false);
      toast.success("Obiectivul a fost creat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProgress = useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      const { error } = await supabase.from("goals").update({ progress }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const goals = data?.goals ?? [];
  const nameFor = (id: string | null) =>
    id ? (data?.profiles.find((p) => p.id === id)?.full_name ?? "Agent") : "Toată agenția";

  return (
    <>
      <PageHeader
        title="Obiective"
        description="Ținte lunare pe agenție și pe agent, cu progres vizibil pentru toată echipa."
        actions={
          user?.isAdmin ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              Adaugă obiectiv
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Se încarcă obiectivele…</p>
      ) : goals.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Layers}
            title="Niciun obiectiv definit"
            description="Adminul agenției poate defini ținte lunare pentru echipă."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const pct =
              Number(g.target) > 0
                ? Math.min(100, Math.round((Number(g.progress) / Number(g.target)) * 100))
                : 0;
            return (
              <div key={g.id} className="panel space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{goalMetricLabels[g.metric] ?? g.metric}</p>
                    <p className="text-xs text-muted-foreground">
                      {nameFor(g.user_id)} · {g.period}
                    </p>
                  </div>
                  <span className="text-lg font-semibold">{pct}%</span>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {Number(g.progress)} din {Number(g.target)}
                  </span>
                  {user?.isAdmin ? (
                    <Input
                      type="number"
                      className="h-8 w-24"
                      defaultValue={Number(g.progress)}
                      onBlur={(e) =>
                        updateProgress.mutate({ id: g.id, progress: Number(e.target.value) || 0 })
                      }
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Obiectiv nou</DialogTitle>
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
              <Select value={form.metric} onValueChange={(v) => setForm((f) => ({ ...f, metric: v }))}>
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
    </>
  );
}
