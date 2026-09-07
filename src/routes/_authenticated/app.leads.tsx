import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Flame, Phone, MessageCircle, Plus, History } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime, formatMoney, relativeDays } from "@/lib/format";
import { leadStageLabels, leadStages } from "@/lib/labels";
import { leadLostReasons, logAudit } from "@/lib/crm";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/app/leads")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean; stage?: string } => {
    const out: { new?: boolean; stage?: string } = {};
    if (search["new"] === true || search["new"] === "true") out.new = true;
    const stage = typeof search["stage"] === "string" ? search["stage"] : undefined;
    if (stage && (leadStages as readonly string[]).includes(stage)) out.stage = stage;
    return out;
  },
  component: LeadsPage,
});


type Lead = Tables<"leads">;
type LeadStage = Lead["stage"];

const pipelineStages = leadStages.filter((s) => s !== "lost") as LeadStage[];
const allColumns = [...pipelineStages, "lost" as LeadStage];

const stageTone: Record<string, "neutral" | "success" | "warning" | "info" | "danger" | "primary"> = {
  new: "info",
  contacted: "primary",
  qualified: "primary",
  viewing: "warning",
  offer: "warning",
  negotiation: "warning",
  transaction: "success",
  won: "success",
  lost: "danger",
};

function emptyForm() {
  return {
    id: "",
    name: "",
    phone: "",
    email: "",
    source: "site",
    campaign: "",
    stage: "new" as LeadStage,
    score: "50",
    value: "",
    property_id: "",
    request_id: "",
    assigned_to: "",
    next_followup_at: "",
    notes: "",
  };
}

function LeadsPage() {
  const { new: openNew, stage: stageParam } = Route.useSearch();
  // Etapa primită din dashboard restrânge board-ul la o singură coloană.
  const columns = stageParam ? [stageParam as LeadStage] : allColumns;

  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(Boolean(openNew));
  const [editing, setEditing] = useState<Lead | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [lostDialog, setLostDialog] = useState<{ lead: Lead } | null>(null);
  const [lostReason, setLostReason] = useState(leadLostReasons[0]);
  const [lostReasonFree, setLostReasonFree] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("organization_id", orgId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["profiles", "org", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("organization_id", orgId as string)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const propertyIds = useMemo(
    () => Array.from(new Set(leads.map((l) => l.property_id).filter(Boolean))) as string[],
    [leads],
  );
  const { data: properties = [] } = useQuery({
    queryKey: ["properties", "for-leads", propertyIds],
    enabled: propertyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id,title").in("id", propertyIds);
      if (error) throw error;
      return data;
    },
  });
  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p.title])), [properties]);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a.full_name])), [agents]);

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", "for-leads", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id,first_name,last_name,phone,email")
        .eq("organization_id", orgId as string)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["requests", "for-leads", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("id,title")
        .eq("organization_id", orgId as string)
        .order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: detailData } = useQuery({
    queryKey: ["lead-detail", detailLead?.id],
    enabled: Boolean(detailLead?.id),
    queryFn: async () => {
      const [events, activities] = await Promise.all([
        supabase
          .from("lead_events")
          .select("*")
          .eq("lead_id", detailLead!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("activities")
          .select("*")
          .eq("lead_id", detailLead!.id)
          .order("starts_at", { ascending: false }),
      ]);
      return { events: events.data ?? [], activities: activities.data ?? [] };
    },
  });

  const [form, setForm] = useState(emptyForm());

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditing(lead);
    setForm({
      id: lead.id,
      name: lead.name,
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      source: lead.source ?? "site",
      campaign: lead.campaign ?? "",
      stage: lead.stage,
      score: String(lead.score ?? 50),
      value: lead.value ? String(lead.value) : "",
      property_id: lead.property_id ?? "",
      request_id: lead.request_id ?? "",
      assigned_to: lead.assigned_to ?? "",
      next_followup_at: lead.next_followup_at ? lead.next_followup_at.slice(0, 16) : "",
      notes: lead.notes ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      if (!form.name.trim()) throw new Error("Numele este obligatoriu.");
      const payload = {
        organization_id: orgId,
        assigned_to: form.assigned_to || user?.userId || null,
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        source: form.source || null,
        campaign: form.campaign || null,
        stage: form.stage as never,
        score: Number(form.score) || 0,
        value: form.value ? Number(form.value) : null,
        property_id: form.property_id || null,
        request_id: form.request_id || null,
        next_followup_at: form.next_followup_at ? new Date(form.next_followup_at).toISOString() : null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("leads").update(payload as never).eq("id", editing.id);
        if (error) throw error;
        await logAudit({
          organizationId: orgId,
          actorId: user?.userId,
          action: "lead.update",
          entity: "lead",
          entityId: editing.id,
          newValues: payload,
        });
      } else {
        const { error } = await supabase.from("leads").insert({
          ...payload,
          created_by: user?.userId,
          last_interaction_at: new Date().toISOString(),
        } as never);
        if (error) throw error;
        await logAudit({
          organizationId: orgId,
          actorId: user?.userId,
          action: "lead.create",
          entity: "lead",
          newValues: payload,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setOpen(false);
      toast.success(editing ? "Lead actualizat." : "Lead-ul a fost adăugat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const moveStage = useMutation({
    mutationFn: async ({
      lead,
      stage,
      lostReasonValue,
    }: {
      lead: Lead;
      stage: LeadStage;
      lostReasonValue?: string;
    }) => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      const payload: Record<string, unknown> = {
        stage: stage as never,
        last_interaction_at: new Date().toISOString(),
      };
      if (stage === "lost") payload.lost_reason = lostReasonValue ?? null;
      const { error } = await supabase.from("leads").update(payload as never).eq("id", lead.id);
      if (error) throw error;
      const { error: eventError } = await supabase.from("lead_events").insert({
        organization_id: orgId,
        lead_id: lead.id,
        from_stage: lead.stage,
        to_stage: stage as never,
        actor_id: user?.userId ?? null,
        note: lostReasonValue ?? null,
      } as never);
      if (eventError) throw eventError;

      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "lead.stage_change",
        entity: "lead",
        entityId: lead.id,
        oldValues: { stage: lead.stage },
        newValues: { stage },
      });
    },
    onMutate: async ({ lead, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["leads", orgId] });
      const prev = queryClient.getQueryData<Lead[]>(["leads", orgId]);
      queryClient.setQueryData<Lead[]>(["leads", orgId], (old) =>
        (old ?? []).map((l) => (l.id === lead.id ? { ...l, stage } : l)),
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["leads", orgId], ctx.prev);
      toastError(e);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead_events"] });
    },

  });

  const handleDrop = (stage: LeadStage) => {
    if (!dragId) return;
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.stage === stage) return;
    if (stage === "lost") {
      setLostDialog({ lead });
      setLostReason(leadLostReasons[0]);
      setLostReasonFree("");
      return;
    }
    moveStage.mutate({ lead, stage });
  };

  const confirmLost = () => {
    if (!lostDialog) return;
    const reason = lostReason === "Altul" ? lostReasonFree || "Altul" : lostReason;
    moveStage.mutate({ lead: lostDialog.lead, stage: "lost", lostReasonValue: reason });
    setLostDialog(null);
  };

  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[],
    [leads],
  );
  const campaigns = useMemo(
    () => Array.from(new Set(leads.map((l) => l.campaign).filter(Boolean))) as string[],
    [leads],
  );

  const visible = leads.filter((l) => {
    if (onlyMine && l.assigned_to !== user?.userId) return false;
    if (agentFilter !== "all" && l.assigned_to !== agentFilter) return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    if (campaignFilter !== "all" && l.campaign !== campaignFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !l.name.toLowerCase().includes(q) &&
        !(l.phone ?? "").toLowerCase().includes(q) &&
        !(l.email ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const isOverdue = (lead: Lead) =>
    lead.next_followup_at ? new Date(lead.next_followup_at).getTime() < Date.now() : false;

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
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Adaugă lead
            </Button>
          </>
        }
      />

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <Input
          placeholder="Caută nume, telefon, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Agent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toți agenții</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Sursă" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate sursele</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Campanie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate campaniile</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <InlineLoading label="Se încarcă pipeline-ul…" className="panel" />
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Flame}
            title="Niciun lead"
            description="Adaugă primul lead sau conectează formularele de pe site."
            action={
              <Button size="sm" onClick={openCreate}>
                Adaugă lead
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((stage) => {
            const items = visible.filter((l) => l.stage === stage);
            const total = items.reduce((sum, l) => sum + (l.value ?? 0), 0);
            return (
              <div
                key={stage}
                data-stage={stage}
                className="panel flex w-72 shrink-0 flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage)}
              >

                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{leadStageLabels[stage]}</p>
                    <p className="text-xs text-muted-foreground">{formatMoney(total)}</p>
                  </div>
                  <StatusBadge tone={stageTone[stage]}>{items.length}</StatusBadge>
                </div>
                <div className="flex-1 space-y-3 p-3">
                  {items.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onClick={() => setDetailLead(l)}
                      className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/40"
                    >
                      <p className="text-sm font-medium">{l.name}</p>
                      {l.property_id ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {propertyById.get(l.property_id) ?? "Proprietate"}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {l.source ?? "necunoscut"} · {formatMoney(l.value)}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{agentById.get(l.assigned_to ?? "") ?? "Neasignat"}</span>
                        <span>{relativeDays(l.last_interaction_at)}</span>
                      </div>
                      {l.next_followup_at ? (
                        <p className={`mt-1 text-xs ${isOverdue(l) ? "font-medium text-destructive" : "text-warning"}`}>
                          Follow-up: {relativeDays(l.next_followup_at)}
                        </p>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 w-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(l);
                        }}
                      >
                        Editează
                      </Button>
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editează lead" : "Lead nou"}</DialogTitle>
          </DialogHeader>
          <form
            className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Nume client</Label>
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
                <Label>Proprietate</Label>
                <Select
                  value={form.property_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, property_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Opțional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără proprietate</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cerere</Label>
                <Select
                  value={form.request_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, request_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Opțional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără cerere</SelectItem>
                    {requests.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sursă</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label htmlFor="campaign">Campanie</Label>
                <Input
                  id="campaign"
                  value={form.campaign}
                  onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">Valoare estimată</Label>
                <Input
                  id="value"
                  type="number"
                  min="0"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Etapă</Label>
                <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v as LeadStage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {leadStages.map((s) => (
                      <SelectItem key={s} value={s}>{leadStageLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select
                  value={form.assigned_to || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Neasignat" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Neasignat</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="followup">Follow-up</Label>
                <Input
                  id="followup"
                  type="datetime-local"
                  value={form.next_followup_at}
                  onChange={(e) => setForm((f) => ({ ...f, next_followup_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Scor: {form.score}</Label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Number(form.score) || 0]}
                onValueChange={([v]) => setForm((f) => ({ ...f, score: String(v) }))}
              />
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
              <Button type="submit" disabled={save.isPending}>
                Salvează lead-ul
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lostDialog)} onOpenChange={(v) => !v && setLostDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motiv pierdere lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motiv</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {leadLostReasons.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lostReason === "Altul" ? (
              <div className="space-y-2">
                <Label>Detalii</Label>
                <Textarea value={lostReasonFree} onChange={(e) => setLostReasonFree(e.target.value)} rows={3} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialog(null)}>Renunță</Button>
            <Button variant="destructive" onClick={confirmLost}>Confirmă pierderea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detailLead)} onOpenChange={(v) => !v && setDetailLead(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detailLead ? (
            <div className="space-y-5 px-1">
              <SheetHeader>
                <SheetTitle>{detailLead.name}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={stageTone[detailLead.stage]}>{leadStageLabels[detailLead.stage]}</StatusBadge>
                <span className="text-sm text-muted-foreground">{formatMoney(detailLead.value)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Telefon</p><p>{detailLead.phone ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p>{detailLead.email ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Sursă</p><p>{detailLead.source ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Campanie</p><p>{detailLead.campaign ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Agent</p><p>{agentById.get(detailLead.assigned_to ?? "") ?? "Neasignat"}</p></div>
                <div><p className="text-xs text-muted-foreground">Scor</p><p>{detailLead.score}</p></div>
              </div>
              {detailLead.notes ? <p className="rounded-lg bg-muted p-3 text-sm">{detailLead.notes}</p> : null}

              <div className="flex flex-wrap gap-2">
                {detailLead.phone ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${detailLead.phone}`}><Phone className="size-4" /> Apel</a>
                  </Button>
                ) : null}
                {detailLead.phone ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://wa.me/${detailLead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}>
                  <Plus className="size-4" /> Adaugă activitate
                </Button>
                <Select
                  value={detailLead.stage}
                  onValueChange={(v) => {
                    const stage = v as LeadStage;
                    if (stage === "lost") {
                      setLostDialog({ lead: detailLead });
                      setLostReason(leadLostReasons[0]);
                      setLostReasonFree("");
                      return;
                    }
                    moveStage.mutate({ lead: detailLead, stage });
                    setDetailLead({ ...detailLead, stage });
                  }}
                >
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {leadStages.map((s) => (
                      <SelectItem key={s} value={s}>{leadStageLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="size-4" /> Istoric</p>
                <ul className="space-y-2 text-sm">
                  {(detailData?.events ?? []).map((ev) => (
                    <li key={ev.id} className="rounded-lg border border-border p-2 text-xs">
                      <p>
                        {ev.from_stage ? `${leadStageLabels[ev.from_stage]} → ` : ""}
                        {leadStageLabels[ev.to_stage]}
                      </p>
                      <p className="text-muted-foreground">{formatDateTime(ev.created_at)}</p>
                      {ev.note ? <p className="mt-1 text-muted-foreground">{ev.note}</p> : null}
                    </li>
                  ))}
                  {(detailData?.activities ?? []).map((a) => (
                    <li key={a.id} className="rounded-lg border border-border p-2 text-xs">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-muted-foreground">{formatDateTime(a.starts_at)}</p>
                    </li>
                  ))}
                  {(detailData?.events ?? []).length === 0 && (detailData?.activities ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Fără evenimente încă.</p>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        orgId={orgId}
        userId={user?.userId}
        defaults={detailLead ? { leadId: detailLead.id, title: `Follow-up ${detailLead.name}` } : undefined}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["lead-detail", detailLead?.id] })}
      />
    </>
  );
}
