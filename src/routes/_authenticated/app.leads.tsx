import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Flame } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { relativeDays } from "@/lib/format";
import { leadStageLabels, leadStages } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/leads")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search["new"] === true || search["new"] === "true" ? { new: true } : {},
  component: LeadsPage,
});

const pipelineStages = leadStages.filter((s) => s !== "lost");

function LeadsPage() {
  const { new: openNew } = Route.useSearch();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(Boolean(openNew));
  const [onlyMine, setOnlyMine] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    source: "site",
    stage: "new",
    score: "50",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.organization?.id) throw new Error("Agenția nu este configurată.");
      const { error } = await supabase.from("leads").insert({
        organization_id: user.organization.id,
        assigned_to: user.userId,
        created_by: user.userId,
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        source: form.source,
        stage: form.stage as never,
        score: Number(form.score) || 0,
        notes: form.notes || null,
        last_interaction_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setOpen(false);
      setForm({ name: "", phone: "", email: "", source: "site", stage: "new", score: "50", notes: "" });
      toast.success("Lead-ul a fost adăugat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ stage: stage as never, last_interaction_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = leads.filter((l) => !onlyMine || l.assigned_to === user?.userId);

  return (
    <>
      <PageHeader
        title="Pipeline lead-uri"
        description="Urmărește fiecare lead pe etape, de la primul contact până la tranzacție."
        actions={
          <>
            <Button
              variant={onlyMine ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyMine((v) => !v)}
            >
              Doar ale mele
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              Adaugă lead
            </Button>
          </>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Se încarcă pipeline-ul…</p>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Flame}
            title="Niciun lead"
            description="Adaugă primul lead sau conectează formularele de pe site."
            action={
              <Button size="sm" onClick={() => setOpen(true)}>
                Adaugă lead
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipelineStages.map((stage) => {
            const items = visible.filter((l) => l.stage === stage);
            return (
              <div key={stage} className="panel flex w-72 shrink-0 flex-col">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">{leadStageLabels[stage]}</p>
                  <StatusBadge>{items.length}</StatusBadge>
                </div>
                <div className="flex-1 space-y-3 p-3">
                  {items.map((l) => (
                    <div key={l.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                      <p className="text-sm font-medium">{l.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {l.phone ?? l.email ?? "fără contact"} · {l.source ?? "necunoscut"}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Scor {l.score}</span>
                        <span>{relativeDays(l.last_interaction_at)}</span>
                      </div>
                      <Select value={l.stage} onValueChange={(v) => moveStage.mutate({ id: l.id, stage: v })}>
                        <SelectTrigger className="mt-3 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {leadStages.map((s) => (
                            <SelectItem key={s} value={s}>
                              {leadStageLabels[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">Gol</p>
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
            <DialogTitle>Lead nou</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Nume</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sursă</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site">Site propriu</SelectItem>
                    <SelectItem value="portal">Portal imobiliar</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="recomandare">Recomandare</SelectItem>
                    <SelectItem value="apel">Apel direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etapă</Label>
                <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadStages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {leadStageLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="score">Scor (0-100)</Label>
                <Input
                  id="score"
                  type="number"
                  min="0"
                  max="100"
                  value={form.score}
                  onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Renunță
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Salvează lead-ul
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
