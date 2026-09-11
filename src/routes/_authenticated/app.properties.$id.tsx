import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  
  Building2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Printer,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { duplicateProperty } from "@/lib/property-duplicate.functions";
import { DeletePropertyDialog } from "@/components/app/DeletePropertyDialog";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { FormSection, RequiredMark } from "@/components/app/FormSection";
import { DetailSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";

import { ActivityDialog } from "@/components/app/ActivityDialog";
import { PropertyMediaManager } from "@/components/app/PropertyMediaManager";
import {
  PropertyPortalsCard,
  type PropertyPortalsHandle,
} from "@/components/app/PropertyPortalsCard";
import { PropertyDetailsFields, type PropertyDetailsValue } from "@/components/app/PropertyDetailsFields";
import { PROPERTY_DETAIL_FIELDS } from "@/lib/property-detail-fields";
import {
  PropertyTransactionFields,
  emptyTransaction,
  hasTransactionSelection,
  transactionFromProperty,
  transactionPayload,
  type TransactionValue,
} from "@/components/app/PropertyTransactionFields";
import { DocumentsPanel } from "@/components/app/DocumentsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { LocationPicker, emptyLocation, type LocationValue } from "@/components/app/LocationPicker";
import { PropertyLocationMap } from "@/components/app/PropertyLocationMap";
import { PropertyMapClient } from "@/components/app/PropertyMapClient";
import { APPROX_RADIUS_M, publicCoords } from "@/lib/geo";
import { useCurrentUser } from "@/hooks/use-session";
import { brandingFromOrg, buildPresentationHtml } from "@/lib/materials";
import { useAgencyLogoUrl } from "@/components/app/AgencyBrandingCard";

import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
  activityKindLabels,
  leadStageLabels,
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  transactionLabels,
} from "@/lib/labels";
import { activityStatusLabels, activityStatusTone, logAudit } from "@/lib/crm";
import { matchLabel, matchTone, scoreMatch } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/app/properties/$id")({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const agencyLogoUrl = useAgencyLogoUrl(user?.organization?.logo_path);

  const [editing, setEditing] = useState(false);
  
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; kind?: "viewing" | "call" }>({
    open: false,
  });
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  // Butonul unic „Publică” din antet declanșează și aplicarea bifelor de portal.
  const portalsRef = useRef<PropertyPortalsHandle | null>(null);
  const duplicatePropertyFn = useServerFn(duplicateProperty);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const [property, activities, leads, requests, contacts, audit] = await Promise.all([
        supabase.from("properties").select("*").eq("id", id).maybeSingle(),
        supabase.from("activities").select("*").eq("property_id", id).order("starts_at", { ascending: false }),
        supabase.from("leads").select("*").eq("property_id", id),
        supabase.from("requests").select("*").eq("status", "active"),
        supabase.from("contacts").select("id,first_name,last_name,phone,email,whatsapp"),
        supabase
          .from("audit_logs")
          .select("*")
          .eq("entity_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (property.error) throw property.error;
      return {
        property: property.data,
        activities: activities.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        contacts: contacts.data ?? [],
        audit: audit.data ?? [],
      };
    },
  });

  const property = data?.property;

  const [draft, setDraft] = useState<Record<string, string>>({});
  // Localizarea oficială SIRUTA a anunțului (județ + localitate).
  const [location, setLocation] = useState<LocationValue>(emptyLocation);
  // Secțiunile de detalii (Detalii / Suprafețe / Clădire / Utilități / Finisaje / Dotări).
  const [details, setDetails] = useState<PropertyDetailsValue>({});
  // Vânzare / închiriere (pot fi active simultan), fiecare cu preț și monedă.
  const [tx, setTx] = useState<TransactionValue>(emptyTransaction);
  // Poziția pe hartă (Leaflet/OpenStreetMap) și precizia locației, în modul editare.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPrecise, setLocationPrecise] = useState(false);
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
    setCoords(
      typeof property.lat === "number" && typeof property.lng === "number"
        ? { lat: property.lat, lng: property.lng }
        : null,
    );
    setLocationPrecise(Boolean(property.location_precise));
    setTx(transactionFromProperty(property));
    setDetails(
      Object.fromEntries(
        PROPERTY_DETAIL_FIELDS.map((key) => [key, (property as Record<string, unknown>)[key] ?? null]),
      ),
    );
    setLocation({
      countySirutaCode: property.county_siruta_code ?? null,
      countyName: property.county ?? "",
      uatSirutaCode: property.uat_siruta_code ?? null,
      localitySirutaCode: property.locality_siruta_code ?? null,
      localityName: property.locality_siruta_code ? (property.city ?? "") : "",
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("properties")
        .update({ ...patch, updated_by: user?.userId ?? null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setEditing(false);
      toast.success("Modificările au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  /** Datele formularului de editare, folosite atât la „Salvează”, cât și la „Publică”. */
  const buildEditPatch = (): Record<string, unknown> => ({
    title: draft.title,
    ...transactionPayload(tx),
    surface: draft.surface ? Number(draft.surface) : null,
    city: location.localityName || draft.city || null,
    county: location.countyName || null,
    county_siruta_code: location.countySirutaCode,
    uat_siruta_code: location.uatSirutaCode,
    locality_siruta_code: location.localitySirutaCode,
    district: draft.district || null,
    address: draft.address || null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    location_precise: locationPrecise,
    description: draft.description || null,
    internal_notes: draft.internal_notes || null,
    ...details,
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("properties").update({ status: status as never }).eq("id", id);
      if (error) throw error;
      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "property_status_changed",
        entity: "property",
        entityId: id,
        newValues: { status },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Status actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").update({ status: "archived" as never }).eq("id", id);
      if (error) throw error;
      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "property_archived",
        entity: "property",
        entityId: id,
      });
    },
    onSuccess: () => {
      toast.success("Proprietatea a fost arhivată.");
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      navigate({ to: "/app/properties" });
    },
    onError: (e: Error) => toastError(e),
  });

  /**
   * Acțiunea unică de publicare: (1) salvează modificările nesalvate din formular,
   * (2) publică pe site, (3) aplică bifele curente de portaluri.
   */
  const publish = useMutation({
    mutationFn: async () => {
      if (editing) {
        if (!hasTransactionSelection(tx)) {
          throw new Error("Alege tipul tranzacției: de vânzare, de închiriere sau ambele.");
        }
        const { error: saveError } = await supabase
          .from("properties")
          .update({ ...buildEditPatch(), updated_by: user?.userId ?? null } as never)
          .eq("id", id);
        if (saveError) throw saveError;
      }



      // O ofertă publicată nu poate rămâne „Ciornă”: statusul ciornă este exclus
      // din feeduri și din portaluri, deci publicarea îl trece pe „Activ”.
      const { error } = await supabase
        .from("properties")
        .update({
          publish_status: "published",
          published_at: new Date().toISOString(),
          ...(property?.status === "draft" ? { status: "active" } : {}),
        } as never)
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        organizationId: orgId,
        actorId: user?.userId,
        action: "property_published",
        entity: "property",
        entityId: id,
      });

      // Portalurile sunt opționale: fără bife schimbate nu se întâmplă nimic aici.
      let portals: { results: { ok: boolean; message: string | null }[] } | null = null;
      let portalsError: string | null = null;
      try {
        portals = (await portalsRef.current?.applyPending()) ?? null;
      } catch (e) {
        portalsError = e instanceof Error ? e.message : "Aplicarea portalurilor a eșuat.";
      }
      return { saved: editing, portals, portalsError };
    },
    onSuccess: ({ saved, portals, portalsError }) => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });

      const base = saved
        ? "Modificările au fost salvate și proprietatea a fost publicată."
        : "Proprietatea a fost publicată.";
      const done = (portals?.results ?? []).filter((r) => r.ok && r.message);
      const failed = (portals?.results ?? []).filter((r) => !r.ok);

      if (done.length > 0) toast.success(`${base} ${done.map((r) => r.message).join(" · ")}`);
      else toast.success(base);
      if (failed.length > 0) toast.error(`Portaluri cu erori: ${failed.map((r) => r.message).join(" · ")}`);
      if (portalsError) toast.error(portalsError);
    },
    onError: (e: Error) => toastError(e),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      if (!property) throw new Error("Date insuficiente.");
      return duplicatePropertyFn({ data: { propertyId: property.id } });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      const details = [
        created.imagesCopied === 1
          ? "1 fotografie copiată"
          : `${created.imagesCopied} fotografii copiate`,
        created.documentsCopied === 1
          ? "1 document copiat"
          : `${created.documentsCopied} documente copiate`,
      ].join(" · ");
      toast.success(`Proprietate duplicată. ${details}.`);
      navigate({ to: "/app/properties/$id", params: { id: created.id } });
    },
    onError: (e: Error) => toastError(e),
  });

  const addLead = useMutation({
    mutationFn: async () => {
      if (!orgId || !clientName.trim()) throw new Error("Numele este obligatoriu.");
      const { error } = await supabase.from("leads").insert({
        organization_id: orgId,
        created_by: user?.userId ?? null,
        assigned_to: user?.userId ?? null,
        name: clientName.trim(),
        phone: clientPhone || null,
        property_id: id,
        stage: "new" as never,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead adăugat.");
      setAddClientOpen(false);
      setClientName("");
      setClientPhone("");
      queryClient.invalidateQueries({ queryKey: ["property", id] });
    },
    onError: (e: Error) => toastError(e),
  });

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (!property) {
    return (
      <EmptyState
        icon={Building2}
        title="Proprietate indisponibilă"
        description="Proprietatea nu există sau nu îți este asignată. Ca agent vezi doar proprietățile alocate ție — cere administratorului agenției să ți-o asigneze."

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

  const activities = data?.activities ?? [];
  const upcoming = activities
    .filter((a) => a.status === "planned" && new Date(a.starts_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  const recentActivities = activities.slice(0, 5);
  const activeLeads = (data?.leads ?? []).filter((l) => !["won", "lost"].includes(l.stage));

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
    { label: "Sursă", value: property.source ?? "—" },
    { label: "Adăugat", value: formatDate(property.created_at) },
  ];

  /** Prezentarea folosește identitatea vizuală configurată de agenție. */
  const printSummary = () => {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(
      buildPresentationHtml(brandingFromOrg(user?.organization, agencyLogoUrl), {
        title: property.title,
        location: [property.address, property.district, property.city].filter(Boolean).join(", "),
        price: formatMoney(property.price, property.currency),
        specs,
        description: property.description,
      }),
    );
    w.document.close();
    w.print();
  };


  // Coordonatele arătate în panoul read-only: exacte sau zona aproximativă.
  const mapCoords = publicCoords(property);

  /**
   * Banda de metrici: doar date reale existente în CRM (nu avem contor de
   * vizualizări, deci folosim activitățile planificate).
   */
  const metrics: { label: string; value: string }[] = [
    { label: "Suprafață", value: property.surface ? `${formatNumber(property.surface)} m²` : "—" },
    {
      label: "Camere / etaj",
      value: [
        property.rooms ? `${property.rooms} cam.` : null,
        property.floor !== null && property.floor !== undefined ? `etaj ${property.floor}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    },
    { label: "Lead-uri active", value: String(activeLeads.length) },
    {
      label: "Activități planificate",
      value: String(activities.filter((a) => a.status === "planned").length),
    },
  ];

  return (
    <>


      <PageHeader
        backTo="/app/properties"
        backLabel="Proprietăți"
        eyebrow={
          [property.reference, [property.district, property.city].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ") || "Proprietate"
        }
        title={property.title}
        description={[property.address, property.district, property.city].filter(Boolean).join(", ")}
        meta={
          <>
            <StatusBadge tone={propertyStatusTone[property.status]} dot>
              {propertyStatusLabels[property.status]}
            </StatusBadge>
            <StatusBadge tone={property.publish_status === "published" ? "success" : "neutral"} dot>
              {property.publish_status === "published" ? "Publicat" : "Nepublicat"}
            </StatusBadge>
            {property.negotiable ? <StatusBadge tone="info">Negociabil</StatusBadge> : null}
            {property.collaboration ? (
              <StatusBadge tone="primary">
                {property.collab_commission_percent
                  ? `Colaborare · ${property.collab_commission_percent}%`
                  : "Colaborare"}
              </StatusBadge>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-col items-end gap-3">
            <span className="text-2xl font-medium tracking-tight">
              {formatMoney(property.price, property.currency)}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {editing ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Anulează
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={startEdit}>
                  <Pencil className="size-4" /> Editează
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
                Duplică
              </Button>
              <Button
                size="sm"
                onClick={() => publish.mutate()}
                disabled={publish.isPending || save.isPending}
              >
                {publish.isPending ? "Se publică…" : "Publică"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Mai multe acțiuni">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={printSummary}>
                    <Printer className="size-4" /> Generează prezentare
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {Object.entries(propertyStatusLabels).map(([k, v]) => (
                    <DropdownMenuItem key={k} onClick={() => changeStatus.mutate(k)}>
                      Status: {v}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => archive.mutateAsync()}>
                    Arhivează
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    Șterge definitiv
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />

      <DeletePropertyDialog
        propertyId={id}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        archived={property.status === "archived"}
        onArchive={() => archive.mutateAsync()}
        onDeleted={() => navigate({ to: "/app/properties" })}
      />


      {/* Bandă de metrici: date reale, fără borduri, doar fundal ușor diferit. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl bg-secondary/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="mt-0.5 text-lg font-medium tracking-tight">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {ownerContact?.phone ? (
          <Button size="sm" variant="outline" asChild>
            <a href={`tel:${ownerContact.phone}`}>
              <Phone className="size-4" /> Sună proprietarul
            </a>
          </Button>
        ) : null}
        {(ownerContact?.whatsapp ?? ownerContact?.phone) ? (
          <Button size="sm" variant="outline" asChild>
            <a
              href={`https://wa.me/${(ownerContact?.whatsapp ?? ownerContact?.phone ?? "").replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setActivityDialog({ open: true, kind: "call" })}>
          Adaugă activitate
        </Button>
        <Button size="sm" variant="outline" onClick={() => setActivityDialog({ open: true, kind: "viewing" })}>
          Creează vizionare
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAddClientOpen(true)}>
          <UserPlus className="size-4" /> Adaugă client
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
          {[
            ["overview", "Overview"],
            ["media", "Media"],
            ["leads", `Lead-uri (${data?.leads.length ?? 0})`],
            ["matching", `Cereri compatibile (${matches.length})`],
            ["activities", `Activități (${activities.length})`],
            ["documents", "Documente"],
            ["publishing", "Publicare"],
            ["history", "Istoric"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value as string}
              className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 font-normal shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {editing ? (
            <form
              className="space-y-8"
              onSubmit={(e) => {
                e.preventDefault();
                if (!hasTransactionSelection(tx)) {
                  toast.error("Alege tipul tranzacției: de vânzare, de închiriere sau ambele.");
                  return;
                }
                save.mutate(buildEditPatch());
              }}
            >
              <FormSection title="Date generale">
              <div className="grid gap-5 md:grid-cols-2">
                <LocationPicker idPrefix="edit" value={location} onChange={setLocation} />
                {[
                  ["title", "Titlu"],
                  ["surface", "Suprafață (m²)"],
                  ["district", "Zonă"],
                  ["address", "Adresă"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>
                      {label}
                      {key === "title" ? <RequiredMark /> : null}
                    </Label>
                    <Input id={key} value={draft[key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <PropertyLocationMap
                idPrefix="edit"
                seed={property.id}
                lat={coords?.lat ?? null}
                lng={coords?.lng ?? null}
                precise={locationPrecise}
                addressParts={[draft.address, draft.district, location.localityName || draft.city, location.countyName]}
                onCoordsChange={setCoords}
                onPreciseChange={setLocationPrecise}
              />
              </FormSection>

              <FormSection title="Tranzacție și preț" description="Alege vânzare, închiriere sau ambele.">
                <PropertyTransactionFields idPrefix="edit" value={tx} onChange={setTx} />
              </FormSection>

              <FormSection title="Descriere">
              <div className="space-y-2">
                <Label htmlFor="description">Descriere</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
              </FormSection>

              <FormSection title="Detalii complete">
                <PropertyDetailsFields
                  idPrefix="edit"
                  value={details}
                  onChange={(patch) => setDetails((d) => ({ ...d, ...patch }))}
                />
              </FormSection>


              <FormSection title="Note interne" description="Nu se publică pe site sau pe portaluri.">
              <div className="space-y-2">
                <Label htmlFor="internal_notes">Note interne</Label>
                <Textarea
                  id="internal_notes"
                  rows={3}
                  value={draft.internal_notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_notes: e.target.value }))}
                />
              </div>
              </FormSection>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Anulează
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  Salvează
                </Button>
              </div>
            </form>
          ) : null}

          {!editing ? (

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <div className="panel p-5">
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

                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Hartă</h2>
                  {mapCoords ? (
                    <div className="mt-3 space-y-2">
                      <PropertyMapClient
                        lat={mapCoords.lat}
                        lng={mapCoords.lng}
                        precise={mapCoords.precise}
                        seed={property.id}
                        className="h-64 w-full overflow-hidden rounded-xl border border-border"
                      />
                      <p className="text-xs text-muted-foreground">
                        {mapCoords.precise
                          ? "Locație exactă."
                          : `Hartă estimativă — zonă de aproximativ ${APPROX_RADIUS_M} m.`}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nu există coordonate GPS pentru această proprietate.
                    </p>
                  )}
                </div>

                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Specificații</h2>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    {specs.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
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
                      <Link to="/app/contacts/$id" params={{ id: ownerContact.id }} className="font-medium hover:text-primary">
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

              <div className="space-y-6">
                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Următoarea activitate</h2>
                  {upcoming ? (
                    <div className="mt-3 text-sm">
                      <p className="font-medium">{upcoming.title}</p>
                      <p className="text-muted-foreground">{formatDateTime(upcoming.starts_at)}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Nicio activitate planificată.</p>
                  )}
                </div>

                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Activități recente</h2>
                  {recentActivities.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Nicio activitate.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {recentActivities.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{a.title}</span>
                          <StatusBadge tone={activityStatusTone[a.status]}>{activityStatusLabels[a.status]}</StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Lead-uri active</h2>
                  {activeLeads.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Niciun lead activ.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {activeLeads.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{l.name}</span>
                          <StatusBadge tone="info">{leadStageLabels[l.stage]}</StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel p-5">
                  <h2 className="text-sm font-semibold">Top potriviri</h2>
                  {matches.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Nicio potrivire momentan.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {matches.slice(0, 3).map(({ request, match }) => (
                        <li key={request.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{request.title}</span>
                          <StatusBadge tone={matchTone(match.score)}>{match.score}%</StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}

        </TabsContent>

        <TabsContent value="media">
          <PropertyMediaManager propertyId={id} orgId={orgId} userId={user?.userId} />
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

        <TabsContent value="matching">
          <div className="panel overflow-hidden">
            {matches.length === 0 ? (
              <EmptyState icon={Sparkles} title="Nicio cerere potrivită" description="Când vor apărea cereri compatibile, le vezi aici automat." />
            ) : (
              <ul className="divide-y divide-border">
                {matches.map(({ request, match }) => (
                  <li key={request.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{request.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{match.reasons.join(" · ") || "Potrivire parțială"}</p>
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
          <DocumentsPanel entityType="property" entityId={id} orgId={orgId} />
        </TabsContent>

        <TabsContent forceMount value="publishing" className="space-y-4 data-[state=inactive]:hidden">
          <div className="panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Status publicare</h2>
                <p className="text-sm text-muted-foreground">
                  {property.publish_status === "published"
                    ? `Publicat pe ${formatDateTime(property.published_at)}`
                    : "Proprietatea nu este publicată încă."}
                </p>
              </div>
            </div>
            {property.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {property.tags.map((t) => (
                  <StatusBadge key={t}>{t}</StatusBadge>
                ))}
              </div>
            ) : null}
          </div>

          <PropertyPortalsCard ref={portalsRef} propertyId={id} />
        </TabsContent>

        <TabsContent value="history">
          <div className="panel overflow-hidden">
            {(data?.audit.length ?? 0) === 0 ? (
              <EmptyState title="Niciun eveniment în istoric" />
            ) : (
              <ul className="divide-y divide-border">
                {data?.audit.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{a.action}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ActivityDialog
        open={activityDialog.open}
        onOpenChange={(open) => setActivityDialog((s) => ({ ...s, open }))}
        orgId={orgId}
        userId={user?.userId}
        defaults={{ kind: activityDialog.kind === "viewing" ? "viewing" : "call", propertyId: id }}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["property", id] })}
      />

      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă client (lead)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nume</Label>
              <Input id="client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Telefon</Label>
              <Input id="client-phone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddClientOpen(false)}>
              Anulează
            </Button>
            <Button onClick={() => addLead.mutate()} disabled={addLead.isPending}>
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
