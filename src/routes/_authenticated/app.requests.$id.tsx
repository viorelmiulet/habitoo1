import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Mail, MessageCircle, Phone, Sparkles, Target, UserPlus } from "lucide-react";
import { toast } from "sonner";
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
import { formatDateTime, formatMoney, formatNumber, relativeDays } from "@/lib/format";
import { activityKindLabels, leadStageLabels, propertyTypeLabels, requestKindLabels } from "@/lib/labels";
import { activityStatusLabels, activityStatusTone, logAudit, requestStatusLabels, requestStatusOptions, requestStatusTone } from "@/lib/crm";
import { matchLabel, matchTone, scoreMatch } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/app/requests/$id")({
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
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; propertyId?: string }>({ open: false });

  const { data, isLoading } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const [request, contacts, agents, leads, activities] = await Promise.all([
        supabase.from("requests").select("*").eq("id", id).maybeSingle(),
        supabase.from("contacts").select("id,first_name,last_name,phone,email,whatsapp"),
        supabase.from("profiles").select("id,full_name"),
        supabase.from("leads").select("*").eq("request_id", id).order("created_at", { ascending: false }),
        supabase.from("activities").select("*").eq("request_id", id).order("starts_at", { ascending: false }),
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

  const contact = data?.contacts.find((c) => c.id === request?.contact_id);
  const agentName = (aid: string | null) => data?.agents.find((a) => a.id === aid)?.full_name ?? "—";

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
      const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
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
      const { error } = await supabase.from("requests").update(patch as never).eq("id", id);
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
      const { error } = await supabase.from("requests").update({ status } as never).eq("id", id);
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
      const { error } = await supabase.from("requests").update({ priority } as never).eq("id", id);
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
      const { error } = await supabase.from("requests").update({ assigned_to } as never).eq("id", id);
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

  const matches = properties
    .map((p) => ({ property: p, match: scoreMatch(request, p) }))
    .filter((m) => m.match.score >= 40)
    .sort((a, b) => b.match.score - a.match.score);

  const leads = data?.leads ?? [];
  const activities = data?.activities ?? [];

  const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

  const propertyMessage = (p: (typeof properties)[number]) =>
    `${p.title} – ${formatMoney(p.price, p.currency)}, ${p.city ?? ""}, ${p.rooms ?? "?"} camere, ${formatNumber(p.surface)} m²`;

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

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <Select value={request.status} onValueChange={(v) => setStatus.mutate(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {requestStatusOptions.map((k) => (<SelectItem key={k} value={k}>{requestStatusLabels[k]}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={request.priority} onValueChange={(v) => setPriority.mutate(v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Prioritate" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Scăzută</SelectItem>
            <SelectItem value="medium">Medie</SelectItem>
            <SelectItem value="high">Ridicată</SelectItem>
          </SelectContent>
        </Select>
        <Select value={request.assigned_to ?? ""} onValueChange={(v) => setAssigned.mutate(v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Agent responsabil" /></SelectTrigger>
          <SelectContent>
            {(data?.agents ?? []).map((a) => (<SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>))}
          </SelectContent>
        </Select>
        <StatusBadge tone={requestStatusTone[request.status]}>{requestStatusLabels[request.status]}</StatusBadge>
        <span className="text-xs text-muted-foreground">{relativeDays(request.created_at)}</span>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        {contact ? (
          <>
            <Link to="/app/contacts/$id" params={{ id: contact.id }} className="font-medium hover:text-primary">
              {contact.first_name} {contact.last_name}
            </Link>
            {contact.phone ? (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${contact.phone}`}>
                  <Phone className="size-4" /> Sună
                </a>
              </Button>
            ) : null}
            {(contact.whatsapp ?? contact.phone) ? (
              <Button size="sm" variant="outline" asChild>
                <a href={whatsappHref(contact.whatsapp ?? contact.phone ?? "")} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Niciun contact asociat.</p>
        )}
      </div>

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
                  <Input id="budget_min" value={String(draft.budget_min ?? "")} onChange={(e) => setDraft((d) => ({ ...d, budget_min: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget_max">Buget maxim</Label>
                  <Input id="budget_max" value={String(draft.budget_max ?? "")} onChange={(e) => setDraft((d) => ({ ...d, budget_max: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Monedă</Label>
                  <Select value={String(draft.currency ?? "EUR")} onValueChange={(v) => setDraft((d) => ({ ...d, currency: v }))}>
                    <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
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
                  <Input id="cities" value={String(draft.cities ?? "")} onChange={(e) => setDraft((d) => ({ ...d, cities: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="areas">Zone (separate prin virgulă)</Label>
                  <Input id="areas" value={String(draft.areas ?? "")} onChange={(e) => setDraft((d) => ({ ...d, areas: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="rooms_min">Camere minim</Label>
                  <Input id="rooms_min" value={String(draft.rooms_min ?? "")} onChange={(e) => setDraft((d) => ({ ...d, rooms_min: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rooms_max">Camere maxim</Label>
                  <Input id="rooms_max" value={String(draft.rooms_max ?? "")} onChange={(e) => setDraft((d) => ({ ...d, rooms_max: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="surface_min">Suprafață minimă (m²)</Label>
                  <Input id="surface_min" value={String(draft.surface_min ?? "")} onChange={(e) => setDraft((d) => ({ ...d, surface_min: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="floor_preference">Etaj preferat</Label>
                  <Input id="floor_preference" value={String(draft.floor_preference ?? "")} onChange={(e) => setDraft((d) => ({ ...d, floor_preference: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="term">Termen</Label>
                  <Input id="term" value={String(draft.term ?? "")} onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={Boolean(draft.furnished)} onCheckedChange={(v) => setDraft((d) => ({ ...d, furnished: Boolean(v) }))} />
                  Mobilat
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={Boolean(draft.wants_parking)} onCheckedChange={(v) => setDraft((d) => ({ ...d, wants_parking: Boolean(v) }))} />
                  Parcare
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={Boolean(draft.wants_balcony)} onCheckedChange={(v) => setDraft((d) => ({ ...d, wants_balcony: Boolean(v) }))} />
                  Balcon
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="features">Facilități (separate prin virgulă)</Label>
                <Input id="features" value={String(draft.features ?? "")} onChange={(e) => setDraft((d) => ({ ...d, features: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Sursă</Label>
                <Input id="source" value={String(draft.source ?? "")} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea id="notes" rows={4} value={String(draft.notes ?? "")} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
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
            <div className="panel p-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Buget</dt>
                  <dd className="font-medium">{formatMoney(request.budget_min, request.currency)} – {formatMoney(request.budget_max, request.currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Localități</dt>
                  <dd className="font-medium">{(request.cities ?? []).join(", ") || "orice oraș"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Zone</dt>
                  <dd className="font-medium">{(request.areas ?? []).join(", ") || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Camere</dt>
                  <dd className="font-medium">{request.rooms_min ?? "—"} – {request.rooms_max ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Suprafață minimă</dt>
                  <dd className="font-medium">{request.surface_min ? `${formatNumber(request.surface_min)} m²` : "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Etaj preferat</dt>
                  <dd className="font-medium">{request.floor_preference || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Mobilat</dt>
                  <dd className="font-medium">{request.furnished ? "Da" : "Nu contează"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Parcare</dt>
                  <dd className="font-medium">{request.wants_parking ? "Da" : "Nu contează"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Balcon</dt>
                  <dd className="font-medium">{request.wants_balcony ? "Da" : "Nu contează"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Termen</dt>
                  <dd className="font-medium">{request.term || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Sursă</dt>
                  <dd className="font-medium">{request.source || "—"}</dd>
                </div>
              </dl>
              {request.features.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {request.features.map((f) => (<StatusBadge key={f}>{f}</StatusBadge>))}
                </div>
              ) : null}
              {request.notes ? (
                <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">Note</p>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{request.notes}</p>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matching">
          <div className="panel overflow-hidden">
            {matches.length === 0 ? (
              <EmptyState icon={Sparkles} title="Nicio proprietate potrivită" description="Când vor apărea proprietăți compatibile, le vezi aici automat." />
            ) : (
              <ul className="divide-y divide-border">
                {matches.map(({ property, match }) => (
                  <li key={property.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link to="/app/properties/$id" params={{ id: property.id }} className="truncate font-medium hover:text-primary">
                        {property.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatMoney(property.price, property.currency)} · {property.city ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-success">
                        {match.reasons.length > 0 ? match.reasons.map((r) => `✓ ${r}`).join("  ") : null}
                      </p>
                      {match.misses.length > 0 ? (
                        <p className="text-xs text-destructive">{match.misses.map((m) => `✕ ${m}`).join("  ")}</p>
                      ) : null}
                    </div>
                    <StatusBadge tone={matchTone(match.score)}>
                      {match.score}% · {matchLabel(match.score)}
                    </StatusBadge>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => createLead.mutate(property.id)} disabled={createLead.isPending}>
                        <UserPlus className="size-4" /> Lead
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setActivityDialog({ open: true, propertyId: property.id })}>
                        Vizionare
                      </Button>
                      {contact?.phone ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={whatsappHref(contact.whatsapp ?? contact.phone ?? "")} target="_blank" rel="noreferrer">
                            <MessageCircle className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      {contact?.email ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`mailto:${contact.email}?subject=${encodeURIComponent(property.title)}&body=${encodeURIComponent(propertyMessage(property))}`}>
                            <Mail className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
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
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    <StatusBadge tone="info">{leadStageLabels[l.stage]}</StatusBadge>
                    <span className="text-xs text-muted-foreground">Scor {l.score}</span>
                  </li>
                ))}
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
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone={activityStatusTone[a.status]}>{activityKindLabels[a.kind]}</StatusBadge>
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
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
