import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

const priorityLabels: Record<string, string> = {
  low: "Scăzută",
  medium: "Medie",
  high: "Ridicată",
};
const priorityTone: Record<string, "neutral" | "info" | "warning"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
};
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Banknote,
  BedDouble,
  CalendarClock,
  Check,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Ruler,
  Sparkles,
  Target,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { DetailSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { DocumentsPanel } from "@/components/app/DocumentsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { brandingFromOrg, materialSignature } from "@/lib/materials";
import { formatDateTime, formatMoney, formatNumber, relativeDays } from "@/lib/format";
import {
  activityKindLabels,
  leadStageLabels,
  propertyTypeLabels,
  requestKindLabels,
} from "@/lib/labels";
import {
  activityStatusLabels,
  activityStatusTone,
  logAudit,
  requestStatusLabels,
  requestStatusOptions,
  requestStatusTone,
} from "@/lib/crm";
import { scoreMatch } from "@/lib/matching";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/requests/$id")({
  head: () => appHead("Habitoo CRM — detalii cerere"),
  component: RequestDetailPage,
});

function RequestDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; propertyId?: string }>({
    open: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const [request, contacts, agents, leads, activities] = await Promise.all([
        supabase.from("requests").select("*").eq("id", id).maybeSingle(),
        supabase.from("contacts").select("id,first_name,last_name,phone,email,whatsapp"),
        supabase.from("profiles").select("id,full_name"),
        supabase
          .from("leads")
          .select("*")
          .eq("request_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("activities")
          .select("*")
          .eq("request_id", id)
          .order("starts_at", { ascending: false }),
      ]);
      if (request.error) throw request.error;
      return {
        request: request.data,
        contacts: contacts.data ?? [],
        agents: agents.data ?? [],
        leads: leads.data ?? [],
        activities: activities.data ?? [],
      };
    },
  });

  const request = data?.request;

  const { data: properties = [] } = useQuery({
    queryKey: ["properties-for-match", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("organization_id", orgId!)
        .not("status", "in", "(archived,sold,rented)")
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  // Potrivirile se calculează înainte de returnurile timpurii, ca să putem
  // încăca coverele printr-un hook apelat necondiționat.
  const matches = request
    ? properties
        .map((p) => ({ property: p, match: scoreMatch(request, p) }))
        .filter((m) => m.match.score >= 40)
        .sort((a, b) => b.match.score - a.match.score)
    : [];
  const coverFor = usePropertyCovers(matches.map((m) => m.property.id));

  const contact = data?.contacts.find((c) => c.id === request?.contact_id);
  const agentName = (aid: string | null) =>
    data?.agents.find((a) => a.id === aid)?.full_name ?? "—";

  const startEdit = () => {
    if (!request) return;
    setDraft({
      budget_min: request.budget_min ? String(request.budget_min) : "",
      budget_max: request.budget_max ? String(request.budget_max) : "",
      currency: request.currency ?? "EUR",
      cities: (request.cities ?? []).join(", "),
      areas: (request.areas ?? []).join(", "),
      rooms_min: request.rooms_min ? String(request.rooms_min) : "",
      rooms_max: request.rooms_max ? String(request.rooms_max) : "",
      surface_min: request.surface_min ? String(request.surface_min) : "",
      floor_preference: request.floor_preference ?? "",
      furnished: request.furnished ?? false,
      wants_parking: request.wants_parking ?? false,
      wants_balcony: request.wants_balcony ?? false,
      features: (request.features ?? []).join(", "),
      term: request.term ?? "",
      source: request.source ?? "",
      notes: request.notes ?? "",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const list = (v: string) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const patch = {
        budget_min: num(String(draft.budget_min ?? "")),
        budget_max: num(String(draft.budget_max ?? "")),
        currency: draft.currency || "EUR",
        cities: list(String(draft.cities ?? "")),
        areas: list(String(draft.areas ?? "")),
        rooms_min: num(String(draft.rooms_min ?? "")),
        rooms_max: num(String(draft.rooms_max ?? "")),
        surface_min: num(String(draft.surface_min ?? "")),
        floor_preference: draft.floor_preference || null,
        furnished: Boolean(draft.furnished),
        wants_parking: Boolean(draft.wants_parking),
        wants_balcony: Boolean(draft.wants_balcony),
        features: list(String(draft.features ?? "")),
        term: draft.term || null,
        source: draft.source || null,
        notes: draft.notes || null,
        updated_by: user?.userId ?? null,
      };
      const { error } = await supabase
        .from("requests")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "request_preferences_updated",
        entity: "request",
        entityId: id,
        newValues: patch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      setEditing(false);
      toast.success("Preferințele au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const oldStatus = request?.status;
      const { error } = await supabase
        .from("requests")
        .update({ status } as never)
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "request_status_changed",
        entity: "request",
        entityId: id,
        oldValues: { status: oldStatus },
        newValues: { status },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      toast.success("Status actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const setPriority = useMutation({
    mutationFn: async (priority: string) => {
      const { error } = await supabase
        .from("requests")
        .update({ priority } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      toast.success("Prioritate actualizată.");
    },
    onError: (e: Error) => toastError(e),
  });

  const setAssigned = useMutation({
    mutationFn: async (assigned_to: string) => {
      const { error } = await supabase
        .from("requests")
        .update({ assigned_to } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      toast.success("Agent actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const createLead = useMutation({
    mutationFn: async (propertyId: string) => {
      if (!orgId || !request) throw new Error("Date insuficiente.");
      const name = contact ? `${contact.first_name} ${contact.last_name}` : request.title;
      const { error } = await supabase.from("leads").insert({
        organization_id: orgId,
        created_by: user?.userId ?? null,
        assigned_to: request.assigned_to ?? user?.userId ?? null,
        contact_id: request.contact_id,
        property_id: propertyId,
        request_id: id,
        name,
        stage: "new" as never,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead creat.");
      queryClient.invalidateQueries({ queryKey: ["request", id] });
    },
    onError: (e: Error) => toastError(e),
  });

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (!request) {
    return (
      <EmptyState
        icon={Target}
        title="Cererea nu a fost găsită"
        action={
          <Button asChild size="sm">
            <Link to="/app/requests">Înapoi la listă</Link>
          </Button>
        }
      />
    );
  }

  const leads = data?.leads ?? [];
  const activities = data?.activities ?? [];

  const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

  const propertyMessage = (p: (typeof properties)[number]) =>
    `${p.title} – ${formatMoney(p.price, p.currency)}, ${p.city ?? ""}, ${p.rooms ?? "?"} camere, ${formatNumber(p.surface)} m²

${materialSignature(brandingFromOrg(user?.organization))}`;

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/app/requests">
          <ArrowLeft className="size-4" /> Cereri
        </Link>
      </Button>

      <PageHeader
        title={request.title}
        description={`${requestKindLabels[request.kind]} · ${propertyTypeLabels[request.property_type ?? ""] ?? "orice tip"}`}
        actions={
          editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Anulează
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={startEdit}>
              Editează preferințele
            </Button>
          )
        }
      />

      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Target className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={requestStatusTone[request.status]}>
                {requestStatusLabels[request.status]}
              </StatusBadge>
              <StatusBadge tone={priorityTone[request.priority] ?? "neutral"} dot>
                {priorityLabels[request.priority] ?? request.priority}
              </StatusBadge>
              <StatusBadge>{requestKindLabels[request.kind]}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Creată {relativeDays(request.created_at)} · Responsabil:{" "}
              {agentName(request.assigned_to)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {formatMoney(request.budget_max, request.currency)}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              buget minim {formatMoney(request.budget_min, request.currency)}
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <Select value={request.status} onValueChange={(v) => setStatus.mutate(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {requestStatusOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {requestStatusLabels[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Prioritate
            </span>
            <Select value={request.priority} onValueChange={(v) => setPriority.mutate(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Scăzută</SelectItem>
                <SelectItem value="medium">Medie</SelectItem>
                <SelectItem value="high">Ridicată</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Agent responsabil
            </span>
            <Select value={request.assigned_to ?? ""} onValueChange={(v) => setAssigned.mutate(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Neasignat" />
              </SelectTrigger>
              <SelectContent>
                {(data?.agents ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {contact ? (
        <div className="panel flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {(contact.first_name?.[0] ?? "?").toUpperCase()}
            {(contact.last_name?.[0] ?? "").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to="/app/contacts/$id"
              params={{ id: contact.id }}
              className="truncate font-semibold text-foreground hover:text-primary"
            >
              {contact.first_name} {contact.last_name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {[contact.phone, contact.email].filter(Boolean).join(" · ") ||
                "Clientul acestei cereri"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {contact.phone ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${contact.phone}`}>
                  <Phone className="size-4" /> Sună
                </a>
              </Button>
            ) : null}
            {(contact.whatsapp ?? contact.phone) ? (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={whatsappHref(contact.whatsapp ?? contact.phone ?? "")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
            ) : null}
            {contact.email ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${contact.email}`}>
                  <Mail className="size-4" /> Email
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="panel flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <User className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">Niciun contact asociat acestei cereri.</p>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matching">Proprietăți compatibile ({matches.length})</TabsTrigger>
          <TabsTrigger value="leads">Lead-uri ({leads.length})</TabsTrigger>
          <TabsTrigger value="activities">Activități ({activities.length})</TabsTrigger>
          <TabsTrigger value="documents">Documente</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {editing ? (
            <form
              className="panel space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="budget_min">Buget minim</Label>
                  <Input
                    id="budget_min"
                    value={String(draft.budget_min ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, budget_min: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget_max">Buget maxim</Label>
                  <Input
                    id="budget_max"
                    value={String(draft.budget_max ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, budget_max: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Monedă</Label>
                  <Select
                    value={String(draft.currency ?? "EUR")}
                    onValueChange={(v) => setDraft((d) => ({ ...d, currency: v }))}
                  >
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="RON">RON</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cities">Localități (separate prin virgulă)</Label>
                  <Input
                    id="cities"
                    value={String(draft.cities ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, cities: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="areas">Zone (separate prin virgulă)</Label>
                  <Input
                    id="areas"
                    value={String(draft.areas ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, areas: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="rooms_min">Camere minim</Label>
                  <Input
                    id="rooms_min"
                    value={String(draft.rooms_min ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, rooms_min: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rooms_max">Camere maxim</Label>
                  <Input
                    id="rooms_max"
                    value={String(draft.rooms_max ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, rooms_max: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="surface_min">Suprafață minimă (m²)</Label>
                  <Input
                    id="surface_min"
                    value={String(draft.surface_min ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, surface_min: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="floor_preference">Etaj preferat</Label>
                  <Input
                    id="floor_preference"
                    value={String(draft.floor_preference ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, floor_preference: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="term">Termen</Label>
                  <Input
                    id="term"
                    value={String(draft.term ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(draft.furnished)}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, furnished: Boolean(v) }))}
                  />
                  Mobilat
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(draft.wants_parking)}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, wants_parking: Boolean(v) }))}
                  />
                  Parcare
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(draft.wants_balcony)}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, wants_balcony: Boolean(v) }))}
                  />
                  Balcon
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="features">Facilități (separate prin virgulă)</Label>
                <Input
                  id="features"
                  value={String(draft.features ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, features: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Sursă</Label>
                <Input
                  id="source"
                  value={String(draft.source ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={String(draft.notes ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Anulează
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  Salvează
                </Button>
              </div>
            </form>
          ) : (
            <div className="panel space-y-6 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    icon: Banknote,
                    label: "Buget",
                    value: `${formatMoney(request.budget_min, request.currency)} – ${formatMoney(request.budget_max, request.currency)}`,
                  },
                  {
                    icon: MapPin,
                    label: "Localități",
                    value: (request.cities ?? []).join(", ") || "orice oraș",
                  },
                  {
                    icon: BedDouble,
                    label: "Camere",
                    value: `${request.rooms_min ?? "—"} – ${request.rooms_max ?? "—"}`,
                  },
                  {
                    icon: Ruler,
                    label: "Suprafață minimă",
                    value: request.surface_min ? `${formatNumber(request.surface_min)} m²` : "—",
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className="truncate text-sm font-medium text-foreground">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Zone preferate", value: (request.areas ?? []).join(", ") || "—" },
                  { label: "Etaj preferat", value: request.floor_preference || "—" },
                  { label: "Mobilat", value: request.furnished ? "Da" : "Nu contează" },
                  { label: "Parcare", value: request.wants_parking ? "Da" : "Nu contează" },
                  { label: "Balcon", value: request.wants_balcony ? "Da" : "Nu contează" },
                  { label: "Termen", value: request.term || "—" },
                  { label: "Sursă", value: request.source || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {request.features.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  {request.features.map((f) => (
                    <StatusBadge key={f}>{f}</StatusBadge>
                  ))}
                </div>
              ) : null}
              {request.notes ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">Note</p>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{request.notes}</p>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matching">
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-5 sm:px-6">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Cerere → Proprietăți potrivite
              </p>
              <h2 className="mt-1.5 font-display text-xl font-bold text-foreground">
                {request.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
                  request.budget_max
                    ? `până la ${formatMoney(request.budget_max, request.currency)}`
                    : null,
                  request.rooms_min ? `${request.rooms_min}+ camere` : null,
                  (request.areas ?? []).length > 0 ? (request.areas ?? []).join(", ") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Toate proprietățile compatibile cu această cerere"}
              </p>
            </div>
            {matches.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nicio proprietate potrivită"
                description="Când vor apărea proprietăți compatibile, le vezi aici automat."
              />
            ) : (
              <ul className="divide-y divide-border">
                {matches.map(({ property, match }) => (
                  <li
                    key={property.id}
                    className="flex items-start gap-4 px-5 py-5 text-sm transition-colors hover:bg-surface sm:px-6"
                  >
                    <PropertyThumb
                      propertyId={property.id}
                      title={property.title}
                      cover={coverFor(property.id)}
                      className="size-20 rounded-2xl sm:size-24"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link
                            to="/app/properties/$id"
                            params={{ id: property.id }}
                            className="truncate text-base font-bold text-foreground hover:text-primary"
                          >
                            {property.title}
                          </Link>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {property.reference ?? "—"}
                          </p>
                        </div>
                        <p className="shrink-0 text-base font-bold whitespace-nowrap text-foreground">
                          {formatMoney(property.price, property.currency)}
                        </p>
                      </div>
                      {match.reasons.length + match.misses.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {match.reasons.map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
                            >
                              <Check className="size-3.5" aria-hidden /> {r}
                            </span>
                          ))}
                          {match.misses.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                            >
                              <X className="size-3.5" aria-hidden /> {m}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => createLead.mutate(property.id)}
                          disabled={createLead.isPending}
                        >
                          <UserPlus className="size-4" /> Lead
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActivityDialog({ open: true, propertyId: property.id })}
                        >
                          Vizionare
                        </Button>
                        {contact?.phone ? (
                          <Button variant="outline" size="icon" asChild title="Trimite pe WhatsApp">
                            <a
                              href={whatsappHref(contact.whatsapp ?? contact.phone ?? "")}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Trimite pe WhatsApp"
                            >
                              <MessageCircle className="size-4" />
                            </a>
                          </Button>
                        ) : null}
                        {contact?.email ? (
                          <Button variant="outline" size="icon" asChild title="Trimite pe email">
                            <a
                              href={`mailto:${contact.email}?subject=${encodeURIComponent(property.title)}&body=${encodeURIComponent(propertyMessage(property))}`}
                              aria-label="Trimite pe email"
                            >
                              <Mail className="size-4" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <ScoreRing score={match.score} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <div className="panel overflow-hidden">
            {leads.length === 0 ? (
              <EmptyState title="Niciun lead legat de această cerere" />
            ) : (
              <ul className="divide-y divide-border">
                {leads.map((l) => {
                  const initials = l.name
                    .split(" ")
                    .filter(Boolean)
                    .map((w: string) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  return (
                    <li
                      key={l.id}
                      className="flex items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-surface"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Scor {l.score} · {relativeDays(l.created_at)}
                        </p>
                      </div>
                      <StatusBadge tone="info">{leadStageLabels[l.stage]}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activities">
          <div className="panel overflow-hidden">
            {activities.length === 0 ? (
              <EmptyState title="Nicio activitate înregistrată" />
            ) : (
              <ul className="divide-y divide-border">
                {activities.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-surface"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <CalendarClock className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</p>
                    </div>
                    <StatusBadge tone={activityStatusTone[a.status]}>
                      {activityKindLabels[a.kind]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel entityType="request" entityId={id} orgId={orgId} />
        </TabsContent>
      </Tabs>

      <ActivityDialog
        open={activityDialog.open}
        onOpenChange={(open) => setActivityDialog((s) => ({ ...s, open }))}
        orgId={orgId}
        userId={user?.userId}
        defaults={{
          kind: "viewing",
          propertyId: activityDialog.propertyId,
          contactId: request.contact_id ?? undefined,
          requestId: id,
        }}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["request", id] })}
      />
    </>
  );
}
