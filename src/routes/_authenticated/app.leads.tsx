import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Flame,
  Phone,
  MessageCircle,
  Plus,
  History,
  Mail,
  Clock,
  ArrowRight,
  Home,
  CalendarClock,
  StickyNote,
  Users,
} from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PortalLogo, hasPortalLogo } from "@/components/app/PortalLogo";
import { UserAvatar } from "@/components/app/UserAvatar";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { cn } from "@/lib/utils";

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

const stageTone: Record<string, "neutral" | "success" | "warning" | "info" | "danger" | "primary"> =
  {
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

/** Prezentare: potrivește o sursă textuală cu un portal care are logo local. */
const SOURCE_PORTAL_KEYS = [
  "storia",
  "olx",
  "imobiliare_ro",
  "imobiliare",
  "publi24",
  "clickimob",
  "imospot",
  "homepitch",
  "imove",
];

function portalKeyOf(source: string | null): string | null {
  if (!source) return null;
  const s = source.toLowerCase().replace(/[\s.-]/g, "_");
  for (const key of SOURCE_PORTAL_KEYS) {
    if (s.includes(key)) {
      const normalized = key === "imobiliare" ? "imobiliare_ro" : key;
      return hasPortalLogo(normalized) ? normalized : null;
    }
  }
  return null;
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** Lead fără nicio atingere de peste o săptămână. */
function isStale(lead: Lead) {
  const last = lead.last_interaction_at ?? lead.created_at;
  if (!last) return false;
  return Date.now() - new Date(last).getTime() > STALE_MS;
}

const LEAD_EVENT_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  viewing: Home,
  note: StickyNote,
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
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
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
      const { data, error } = await supabase
        .from("properties")
        .select("id,title")
        .in("id", propertyIds);
      if (error) throw error;
      return data;
    },
  });
  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p.title])), [properties]);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a.full_name])), [agents]);
  const coverFor = usePropertyCovers(propertyIds);

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
      const [events, activities, messages] = await Promise.all([
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
        // Mesajele primite din portaluri; cele expirate nu mai sunt afișate.
        supabase
          .from("portal_messages")
          .select("*")
          .eq("lead_id", detailLead!.id)
          .gt("expires_at", new Date().toISOString())
          .order("sent_at", { ascending: false }),
      ]);
      return {
        events: events.data ?? [],
        activities: activities.data ?? [],
        messages: messages.data ?? [],
      };
    },
  });

  /** Prezentare: îmbină evenimentele de etapă și activitățile într-un singur fir. */
  const timelineItems = useMemo(() => {
    type Item = { id: string; at: string; label: string; note?: string | null; icon: typeof Phone };
    const items: Item[] = [];
    for (const ev of detailData?.events ?? []) {
      items.push({
        id: `ev-${ev.id}`,
        at: ev.created_at,
        label: `${ev.from_stage ? `${leadStageLabels[ev.from_stage]} → ` : ""}${leadStageLabels[ev.to_stage]}`,
        note: ev.note,
        icon: ArrowRight,
      });
    }
    for (const a of detailData?.activities ?? []) {
      items.push({
        id: `ac-${a.id}`,
        at: a.starts_at,
        label: a.title,
        note: a.description,
        icon: LEAD_EVENT_ICONS[a.kind] ?? CalendarClock,
      });
    }
    return items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [detailData]);

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
        next_followup_at: form.next_followup_at
          ? new Date(form.next_followup_at).toISOString()
          : null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("leads")
          .update(payload as never)
          .eq("id", editing.id);
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
      const { error } = await supabase
        .from("leads")
        .update(payload as never)
        .eq("id", lead.id);
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
        description={
          stageParam
            ? `Filtrat pe etapa „${leadStageLabels[stageParam]}”.`
            : "Urmărește fiecare lead pe etape, de la primul contact până la tranzacție."
        }
        actions={
          <>
            {stageParam ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/leads">Toate etapele</Link>
              </Button>
            ) : null}

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
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toți agenții</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sursă" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate sursele</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Campanie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate campaniile</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
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
            const isDropTarget = dragOverStage === stage && dragId !== null;
            return (
              <div
                key={stage}
                data-stage={stage}
                className={cn(
                  "flex w-76 shrink-0 flex-col rounded-2xl bg-muted/40 ring-1 ring-border/60 transition",
                  isDropTarget && "bg-primary/5 ring-2 ring-primary/50",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== stage) setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={() => {
                  setDragOverStage(null);
                  handleDrop(stage);
                }}
              >
                <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{leadStageLabels[stage]}</p>
                    {total > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatMoney(total)}</p>
                    ) : null}
                  </div>
                  <StatusBadge tone={stageTone[stage]}>{items.length}</StatusBadge>
                </div>
                <div className="flex-1 space-y-3 px-3 pb-3">
                  {items.map((l) => {
                    const portalKey = portalKeyOf(l.source);
                    const stale = isStale(l);
                    const agentName = agentById.get(l.assigned_to ?? "") ?? null;
                    return (
                      <div
                        key={l.id}
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => setDetailLead(l)}
                        className={cn(
                          "cursor-pointer rounded-xl bg-card p-3.5 ring-1 ring-border/60 transition hover:ring-primary/40",
                          dragId === l.id && "opacity-40 ring-primary/60",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</p>
                          {stale ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground"
                              title="Fără activitate de peste o săptămână"
                            >
                              <Clock className="size-3" aria-hidden /> stagnat
                            </span>
                          ) : null}
                        </div>

                        {l.property_id ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {propertyById.get(l.property_id) ?? "Proprietate"}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex max-w-40 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {portalKey ? (
                              <PortalLogo
                                portalId={portalKey}
                                name={l.source ?? portalKey}
                                size={14}
                              />
                            ) : null}
                            <span className="truncate">{l.source ?? "sursă necunoscută"}</span>
                          </span>
                          {l.value ? (
                            <span className="text-xs font-medium">{formatMoney(l.value)}</span>
                          ) : null}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <UserAvatar name={agentName} className="size-6 text-[10px]" />
                            <span className="truncate">{agentName ?? "Neasignat"}</span>
                          </span>
                          <span className="shrink-0">{relativeDays(l.last_interaction_at)}</span>
                        </div>

                        {l.next_followup_at ? (
                          <p
                            className={cn(
                              "mt-2 text-xs",
                              isOverdue(l)
                                ? "font-medium text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            Follow-up: {relativeDays(l.next_followup_at)}
                          </p>
                        ) : null}

                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(l);
                          }}
                        >
                          Editează
                        </button>
                      </div>
                    );
                  })}
                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      Nimic în „{leadStageLabels[stage]}”. Trage un lead aici.
                    </p>
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
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, property_id: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opțional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără proprietate</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cerere</Label>
                <Select
                  value={form.request_id || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, request_id: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opțional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fără cerere</SelectItem>
                    {requests.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sursă</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}
                >
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
                <Select
                  value={form.stage}
                  onValueChange={(v) => setForm((f) => ({ ...f, stage: v as LeadStage }))}
                >
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
                <Label>Agent</Label>
                <Select
                  value={form.assigned_to || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, assigned_to: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Neasignat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Neasignat</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name}
                      </SelectItem>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leadLostReasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lostReason === "Altul" ? (
              <div className="space-y-2">
                <Label>Detalii</Label>
                <Textarea
                  value={lostReasonFree}
                  onChange={(e) => setLostReasonFree(e.target.value)}
                  rows={3}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialog(null)}>
              Renunță
            </Button>
            <Button variant="destructive" onClick={confirmLost}>
              Confirmă pierderea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detailLead)} onOpenChange={(v) => !v && setDetailLead(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detailLead ? (
            <div className="space-y-5 px-1">
              <SheetHeader className="pb-0">
                <SheetTitle>{detailLead.name}</SheetTitle>
              </SheetHeader>

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={stageTone[detailLead.stage]}>
                    {leadStageLabels[detailLead.stage]}
                  </StatusBadge>
                  <span className="inline-flex max-w-40 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {portalKeyOf(detailLead.source) ? (
                      <PortalLogo
                        portalId={portalKeyOf(detailLead.source) as string}
                        name={detailLead.source ?? ""}
                        size={14}
                      />
                    ) : null}
                    <span className="truncate">{detailLead.source ?? "sursă necunoscută"}</span>
                  </span>
                  {detailLead.value ? (
                    <span className="text-sm font-medium">{formatMoney(detailLead.value)}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {detailLead.phone ? (
                    <>
                      <a
                        href={`tel:${detailLead.phone}`}
                        className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Phone className="size-4" aria-hidden /> Sună
                      </a>
                      <a
                        href={`https://wa.me/${detailLead.phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MessageCircle className="size-4" aria-hidden /> WhatsApp
                      </a>
                    </>
                  ) : null}
                  {detailLead.email ? (
                    <a
                      href={`mailto:${detailLead.email}`}
                      className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Mail className="size-4" aria-hidden /> Email
                    </a>
                  ) : null}
                </div>
              </div>

              {detailLead.property_id ? (
                <Link
                  to="/app/properties/$id"
                  params={{ id: detailLead.property_id }}
                  className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-border/60 transition hover:ring-primary/40"
                >
                  <PropertyThumb
                    propertyId={detailLead.property_id}
                    title={propertyById.get(detailLead.property_id) ?? "Proprietate"}
                    cover={coverFor(detailLead.property_id)}
                    className="size-14 rounded-lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {propertyById.get(detailLead.property_id) ?? "Proprietate"}
                    </span>
                    <span className="block text-xs text-muted-foreground">Proprietatea legată</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ) : null}

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-border/60">
                <div>
                  <p className="text-xs text-muted-foreground">Telefon</p>
                  <p>{detailLead.phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="truncate">{detailLead.email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Campanie</p>
                  <p>{detailLead.campaign ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Scor</p>
                  <p>{detailLead.score}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="flex items-center gap-2">
                    <UserAvatar
                      name={agentById.get(detailLead.assigned_to ?? "") ?? null}
                      className="size-6 text-[10px]"
                    />
                    {agentById.get(detailLead.assigned_to ?? "") ?? "Neasignat"}
                  </p>
                </div>
              </div>

              {detailLead.notes ? (
                <p className="rounded-xl bg-muted p-3 text-sm">{detailLead.notes}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
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
                  <SelectTrigger className="h-8 w-40 text-xs">
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

              <Tabs defaultValue="history">
                <TabsList>
                  <TabsTrigger value="history">
                    <History className="size-4" /> Istoric
                  </TabsTrigger>
                  <TabsTrigger value="messages">
                    <MessageCircle className="size-4" /> Mesaje
                    {(detailData?.messages ?? []).length > 0 ? (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
                        {(detailData?.messages ?? []).length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="mt-3">
                  {timelineItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Fără evenimente încă.</p>
                  ) : (
                    <ul className="space-y-3">
                      {timelineItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <li key={item.id} className="flex gap-3">
                            <span className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                              {formatDateTime(item.at)}
                            </span>
                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Icon className="size-3.5" aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm">{item.label}</span>
                              {item.note ? (
                                <span className="block text-xs text-muted-foreground">
                                  {item.note}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="messages" className="mt-3">
                  <ul className="space-y-2">
                    {(detailData?.messages ?? []).map((m) => (
                      <li key={m.id} className="rounded-lg border border-border p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{m.sender_name ?? "Contact"}</p>
                          <StatusBadge tone="neutral">
                            {m.portal === "storia" ? "Storia.ro" : m.portal}
                          </StatusBadge>
                        </div>
                        <p className="text-muted-foreground">{formatDateTime(m.sent_at)}</p>
                        {m.body ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-3 text-muted-foreground">
                          {m.sender_phone ? (
                            <a href={`tel:${m.sender_phone}`}>{m.sender_phone}</a>
                          ) : null}
                          {m.sender_email ? (
                            <a href={`mailto:${m.sender_email}`}>{m.sender_email}</a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                    {(detailData?.messages ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Niciun mesaj primit din portaluri pentru acest lead.
                      </p>
                    ) : null}
                  </ul>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Mesajele primite din portaluri se păstrează 180 de zile, apoi se șterg automat.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        orgId={orgId}
        userId={user?.userId}
        defaults={
          detailLead ? { leadId: detailLead.id, title: `Follow-up ${detailLead.name}` } : undefined
        }
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["lead-detail", detailLead?.id] })
        }
      />
    </>
  );
}
