import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Building2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
  activityKindLabels,
  leadStageLabels,
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  transactionLabels,
} from "@/lib/labels";
import { matchLabel, matchTone, scoreMatch } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/app/properties/$id")({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const [property, activities, leads, requests, owner] = await Promise.all([
        supabase.from("properties").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("activities")
          .select("*")
          .eq("property_id", id)
          .order("starts_at", { ascending: false }),
        supabase.from("leads").select("*").eq("property_id", id),
        supabase.from("requests").select("*").eq("status", "active"),
        supabase.from("contacts").select("id,first_name,last_name,phone,email"),
      ]);
      if (property.error) throw property.error;
      return {
        property: property.data,
        activities: activities.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        contacts: owner.data ?? [],
      };
    },
  });

  const property = data?.property;

  const [draft, setDraft] = useState<Record<string, string>>({});
  const startEdit = () => {
    if (!property) return;
    setDraft({
      title: property.title,
      price: property.price ? String(property.price) : "",
      surface: property.surface ? String(property.surface) : "",
      rooms: property.rooms ? String(property.rooms) : "",
      city: property.city ?? "",
      district: property.district ?? "",
      address: property.address ?? "",
      description: property.description ?? "",
      internal_notes: property.internal_notes ?? "",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("properties")
        .update({ ...patch, updated_by: user?.userId ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setEditing(false);
      toast.success("Modificările au fost salvate.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proprietatea a fost arhivată.");
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      navigate({ to: "/app/properties" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Se încarcă proprietatea…</p>;
  }
  if (!property) {
    return (
      <EmptyState
        icon={Building2}
        title="Proprietatea nu a fost găsită"
        action={
          <Button asChild size="sm">
            <Link to="/app/properties">Înapoi la listă</Link>
          </Button>
        }
      />
    );
  }

  const ownerContact = data?.contacts.find((c) => c.id === property.owner_contact_id);
  const matches = (data?.requests ?? [])
    .map((r) => ({ request: r, match: scoreMatch(r, property) }))
    .filter((m) => m.match.score >= 55)
    .sort((a, b) => b.match.score - a.match.score);

  const specs: { label: string; value: string }[] = [
    { label: "Tip", value: propertyTypeLabels[property.property_type] ?? property.property_type },
    { label: "Tranzacție", value: transactionLabels[property.transaction_kind] },
    { label: "Suprafață", value: property.surface ? `${formatNumber(property.surface)} m²` : "—" },
    { label: "Camere", value: property.rooms ? String(property.rooms) : "—" },
    { label: "Băi", value: property.bathrooms ? String(property.bathrooms) : "—" },
    { label: "Etaj", value: property.floor !== null ? String(property.floor) : "—" },
    { label: "An construcție", value: property.build_year ? String(property.build_year) : "—" },
    { label: "Comision", value: property.commission ?? "—" },
    { label: "Referință", value: property.reference ?? "—" },
    { label: "Adăugat", value: formatDate(property.created_at) },
  ];

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to="/app/properties">
          <ArrowLeft className="size-4" /> Proprietăți
        </Link>
      </Button>

      <PageHeader
        title={property.title}
        description={[property.address, property.district, property.city].filter(Boolean).join(", ")}
        actions={
          <>
            <Select
              value={property.status}
              onValueChange={(v) => save.mutate({ status: v })}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(propertyStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Anulează
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="size-4" /> Editează
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => archive.mutate()}>
              <Trash2 className="size-4" /> Arhivează
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={propertyStatusTone[property.status]}>
          {propertyStatusLabels[property.status]}
        </StatusBadge>
        <span className="text-2xl font-semibold tracking-tight">
          {formatMoney(property.price, property.currency)}
        </span>
        {property.negotiable ? <StatusBadge tone="info">Negociabil</StatusBadge> : null}
        {property.collaboration ? <StatusBadge tone="primary">Colaborare</StatusBadge> : null}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Detalii</TabsTrigger>
          <TabsTrigger value="matching">Potriviri ({matches.length})</TabsTrigger>
          <TabsTrigger value="leads">Lead-uri ({data?.leads.length ?? 0})</TabsTrigger>
          <TabsTrigger value="activities">Activități ({data?.activities.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          {editing ? (
            <form
              className="panel space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate({
                  title: draft.title,
                  price: draft.price ? Number(draft.price) : null,
                  surface: draft.surface ? Number(draft.surface) : null,
                  rooms: draft.rooms ? Number(draft.rooms) : null,
                  city: draft.city || null,
                  district: draft.district || null,
                  address: draft.address || null,
                  description: draft.description || null,
                  internal_notes: draft.internal_notes || null,
                });
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["title", "Titlu"],
                  ["price", "Preț"],
                  ["surface", "Suprafață (m²)"],
                  ["rooms", "Camere"],
                  ["city", "Oraș"],
                  ["district", "Zonă"],
                  ["address", "Adresă"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>{label}</Label>
                    <Input
                      id={key}
                      value={draft[key] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descriere</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal_notes">Note interne</Label>
                <Textarea
                  id="internal_notes"
                  rows={3}
                  value={draft.internal_notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_notes: e.target.value }))}
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
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="panel p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold">Descriere</h2>
                <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">
                  {property.description || "Nu există descriere."}
                </p>
                {property.features.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {property.features.map((f) => (
                      <StatusBadge key={f}>{f}</StatusBadge>
                    ))}
                  </div>
                ) : null}
                {property.internal_notes ? (
                  <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
                    <p className="font-medium">Note interne</p>
                    <p className="mt-1 text-muted-foreground">{property.internal_notes}</p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-6">
                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Specificații</h2>
                  <dl className="mt-3 space-y-2 text-sm">
                    {specs.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">{s.label}</dt>
                        <dd className="text-right font-medium">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Proprietar</h2>
                  {ownerContact ? (
                    <div className="mt-3 space-y-1 text-sm">
                      <Link
                        to="/app/contacts/$id"
                        params={{ id: ownerContact.id }}
                        className="font-medium hover:text-primary"
                      >
                        {ownerContact.first_name} {ownerContact.last_name}
                      </Link>
                      <p className="text-muted-foreground">{ownerContact.phone ?? "—"}</p>
                      <p className="text-muted-foreground">{ownerContact.email ?? "—"}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Niciun proprietar asociat.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="matching">
          <div className="panel overflow-hidden">
            {matches.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nicio cerere potrivită"
                description="Când vor apărea cereri compatibile, le vezi aici automat."
              />
            ) : (
              <ul className="divide-y divide-border">
                {matches.map(({ request, match }) => (
                  <li key={request.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{request.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {match.reasons.join(" · ") || "Potrivire parțială"}
                      </p>
                    </div>
                    <StatusBadge tone={matchTone(match.score)}>
                      {match.score}% · {matchLabel(match.score)}
                    </StatusBadge>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/app/requests">Vezi cererea</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <div className="panel overflow-hidden">
            {(data?.leads.length ?? 0) === 0 ? (
              <EmptyState title="Niciun lead pe această proprietate" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.leads.map((l) => (
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
            {(data?.activities.length ?? 0) === 0 ? (
              <EmptyState title="Nicio activitate înregistrată" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.activities.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone={a.done ? "success" : "primary"}>
                      {activityKindLabels[a.kind]}
                    </StatusBadge>
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
