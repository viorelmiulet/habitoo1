import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Printer,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useServerFn } from "@tanstack/react-start";
import { duplicateProperty } from "@/lib/property-duplicate.functions";
import { ArchivePropertyDialog } from "@/components/app/ArchivePropertyDialog";
import { StatusChangeDialog } from "@/components/app/StatusChangeDialog";
import { isWithdrawStatus } from "@/components/app/StatusWithdrawPreview";
import { changePropertyStatus } from "@/lib/property-status.functions";
import { unarchiveProperty } from "@/lib/property-archive.functions";
import { toastError } from "@/lib/errors";
import { FormSection, RequiredMark } from "@/components/app/FormSection";
import { DetailSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";

import { ActivityDialog } from "@/components/app/ActivityDialog";
import { PropertyMediaManager } from "@/components/app/PropertyMediaManager";
import { PropertyAcpCard } from "@/components/app/PropertyAcpCard";
import { PropertyPromotionTab } from "@/components/app/PropertyPromotionTab";
import { MarketingAgentPanel } from "@/components/app/MarketingAgentPanel";

import { PropertyHeroGallery } from "@/components/app/PropertyHeroGallery";
import {
  PropertyPortalsCard,
  type PropertyPortalsHandle,
} from "@/components/app/PropertyPortalsCard";
import {
  PropertyDetailsFields,
  type PropertyDetailsValue,
} from "@/components/app/PropertyDetailsFields";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { resolvePropertyPostalCode } from "@/lib/geo/postal-code.functions";
import { notifyProperstarFeedChanged } from "@/lib/portals/properstar-cache";
import { postalCodeHint } from "@/lib/geo/postal-code";
import { LocationPicker, emptyLocation, type LocationValue } from "@/components/app/LocationPicker";
import { PropertyLocationMap } from "@/components/app/PropertyLocationMap";
import { PropertyMapClient } from "@/components/app/PropertyMapClient";
import { APPROX_RADIUS_M, publicCoords } from "@/lib/geo";
import { useCurrentUser } from "@/hooks/use-session";
import { DeletePropertyDialog, canDeleteProperty } from "@/components/app/DeletePropertyDialog";
import { brandingFromOrg, buildPresentationHtml } from "@/lib/materials";
import { printHtmlDocument } from "@/lib/print";
import { MEDIA_BUCKET, signedUrls } from "@/lib/storage";

import { useAgencyLogoUrl } from "@/components/app/AgencyBrandingCard";
import { UserAvatar } from "@/components/app/UserAvatar";
import { ReassignPropertiesDialog } from "@/components/app/ReassignPropertiesDialog";
import { getPropertiesPortalMatrix, type PropertyPortalCell } from "@/lib/portals.functions";

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
import { appHead } from "@/components/app/app-head";

function cleanLocation(district: string | null, city: string | null): string {
  const normalizedCity = (city ?? "")
    .replace(/Bucure(?:ș|ş)ti\s+Sectorul\s+(\d)/i, "Sector $1, București")
    .replace(/Bucuresti\s+Sectorul\s+(\d)/i, "Sector $1, București");
  if (/^Sector \d, București$/i.test(normalizedCity)) return normalizedCity;
  return [district, normalizedCity].filter(Boolean).join(", ");
}

function portalState(cell: PropertyPortalCell) {
  if (cell.state === "published" || cell.state === "in_feed") return { label: "Publicat", tone: "success" as const };
  if (cell.state === "syncing" || cell.state === "selected") return { label: "În lucru", tone: "warning" as const };
  if (cell.state === "error" || cell.state === "expired") return { label: "Eroare", tone: "danger" as const };
  return { label: "Nepublicat", tone: "neutral" as const };
}

/** Notificare neblocantă despre codul poștal dedus la salvare. */
function postalNotice(report: { status: string; reasonLabel: string } | null): void {
  if (!report) return;
  if (report.status === "failed") {
    toast.warning(`Codul poștal nu a putut fi completat automat: ${report.reasonLabel}`);
  } else if (report.status === "not_found" || report.status === "capped") {
    toast.warning(`Codul poștal a rămas necompletat: ${report.reasonLabel}`);
  }
}

export const Route = createFileRoute("/_authenticated/app/properties/$id")({
  head: () => appHead("Habitoo CRM — detalii proprietate"),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const [reassignOpen, setReassignOpen] = useState(false);
  const { data: orgMembers = [] } = useQuery({
    queryKey: ["profiles", "org", orgId],
    enabled: Boolean(orgId && user?.isAdmin),
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
  const agencyLogoUrl = useAgencyLogoUrl(user?.organization?.logo_path);

  const [editing, setEditing] = useState(false);
  /** Fila activă; butonul din antet duce direct la fluxul ACP. */
  const [tab, setTab] = useState("overview");

  /** Evită tipăriri suprapuse ale fișei de prezentare. */
  const printingRef = useRef(false);
  const [presentationDialogOpen, setPresentationDialogOpen] = useState(false);

  const [activityDialog, setActivityDialog] = useState<{
    open: boolean;
    kind?: "viewing" | "call";
  }>({
    open: false,
  });
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  // Butonul unic „Publică” din antet declanșează și aplicarea bifelor de portal.
  const portalsRef = useRef<PropertyPortalsHandle | null>(null);
  const duplicatePropertyFn = useServerFn(duplicateProperty);
  const unarchivePropertyFn = useServerFn(unarchiveProperty);
  const resolvePostalCode = useServerFn(resolvePropertyPostalCode);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const loadPortalMatrix = useServerFn(getPropertiesPortalMatrix);

  const { data, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const [property, activities, leads, requests, contacts, audit, imageCount] = await Promise.all([
        supabase.from("properties").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("activities")
          .select("*")
          .eq("property_id", id)
          .order("starts_at", { ascending: false }),
        supabase.from("leads").select("*").eq("property_id", id),
        supabase.from("requests").select("*").eq("status", "active"),
        supabase.from("contacts").select("id,first_name,last_name,phone,email,whatsapp"),
        supabase
          .from("audit_logs")
          .select("*")
          .eq("entity_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("property_images")
          .select("id", { count: "exact", head: true })
          .eq("property_id", id),
      ]);
      if (property.error) throw property.error;
      return {
        property: property.data,
        activities: activities.data ?? [],
        leads: leads.data ?? [],
        requests: requests.data ?? [],
        contacts: contacts.data ?? [],
        audit: audit.data ?? [],
        imageCount: imageCount.count ?? 0,
      };
    },
  });

  const property = data?.property;
  const { data: responsibleAgent } = useQuery({
    queryKey: ["property-responsible-agent", property?.assigned_to],
    enabled: Boolean(property?.assigned_to),
    queryFn: async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("full_name,phone,job_title,avatar_url")
        .eq("id", property?.assigned_to ?? "")
        .maybeSingle();
      if (error) throw error;
      return profile;
    },
  });

  const { data: neighbors = [] } = useQuery({
    queryKey: ["property-neighbors", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,reference")
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .neq("status", "archived" as never)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const portalMatrix = useQuery({
    queryKey: ["property-portals-matrix", orgId, id],
    enabled: Boolean(orgId),
    queryFn: () => loadPortalMatrix({ data: { propertyIds: [id] } }),
  });

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
      city: property.city ?? "",
      district: property.district ?? "",
      address: property.address ?? "",
      postal_code: property.postal_code ?? "",
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
        PROPERTY_DETAIL_FIELDS.map((key) => [
          key,
          (property as Record<string, unknown>)[key] ?? null,
        ]),
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
      // Codul poștal lipsă se deduce din adresă, pe server; un cod scris de om
      // rămâne neatins (sursa devine „manual” la salvare). Eșecul nu anulează
      // salvarea, dar se arată ca notificare.
      try {
        return (await resolvePostalCode({ data: { propertyId: id } })) ?? null;
      } catch (error) {
        return {
          status: "failed",
          reasonLabel: error instanceof Error ? error.message : "eroare necunoscută",
        };
      }
    },
    onSuccess: async (postal) => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      notifyProperstarFeedChanged();
      postalNotice(postal);
      setEditing(false);
      toast.success("Modificările au fost salvate.");
    },
    onError: (e: Error) => toastError(e),
  });

  /** Datele formularului de editare, folosite atât la „Salvează”, cât și la „Publică”. */
  const buildEditPatch = (): Record<string, unknown> => {
    // Un cod poștal scris de om are prioritate: îl marcăm „manual” ca să nu fie
    // niciodată înlocuit de valoarea dedusă din adresă.
    const typedPostal = (draft.postal_code ?? "").trim();
    const storedPostal = (property?.postal_code ?? "").trim();
    const postalPatch: Record<string, unknown> =
      typedPostal === storedPostal
        ? {}
        : typedPostal === ""
          ? { postal_code: null, postal_code_source: null, postal_code_resolved_from: null }
          : { postal_code: typedPostal, postal_code_source: "manual" };
    return {
      title: draft.title,
      ...transactionPayload(tx),
      city: location.localityName || draft.city || null,
      county: location.countyName || null,
      county_siruta_code: location.countySirutaCode,
      uat_siruta_code: location.uatSirutaCode,
      locality_siruta_code: location.localitySirutaCode,
      district: draft.district || null,
      address: draft.address || null,
      ...postalPatch,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      location_precise: locationPrecise,
      description: draft.description || null,
      internal_notes: draft.internal_notes || null,
      ...details,
    };
  };

  const changeStatusFn = useServerFn(changePropertyStatus);
  const [pendingStatus, setPendingStatus] = useState<"sold" | "rented" | "archived" | null>(null);
  const changeStatus = useMutation({
    mutationFn: async (status: string) =>
      await changeStatusFn({ data: { propertyIds: [id], status: status as never } }),
    onSuccess: (res) => {
      setPendingStatus(null);
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["property-auto-withdrawals", id] });
      queryClient.invalidateQueries({ queryKey: ["property-portals-selection"] });
      toast.success(
        res.queued > 0
          ? `Status actualizat. Retragerea de pe ${res.queued} portal(uri) rulează în fundal.`
          : "Status actualizat.",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  // Dezarhivarea readuce statusul comercial de dinainte de arhivare (server-side).
  const unarchive = useMutation({
    mutationFn: async () => await unarchivePropertyFn({ data: { propertyId: id } }),
    onSuccess: () => {
      toast.success("Proprietatea a fost readusă în circulație.");
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["property-archive-state", id] });
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
      const results = portals?.results ?? [];
      const done = results.filter((r) => r.ok && r.message);
      const failed = results.filter((r) => !r.ok);

      // Dacă o operație cerută pe un portal a eșuat, rezultatul este PARȚIAL:
      // nu raportăm succes global ambiguu lângă eroarea portalului.
      if (failed.length > 0 || portalsError) {
        const okPart = done.length
          ? `Publicată pe ${done.length} ${done.length === 1 ? "portal" : "portaluri"}`
          : "Niciun portal nu a fost actualizat";
        const failPart = failed
          .map((r) => r.message ?? "eroare portal")
          .concat(portalsError ? [portalsError] : [])
          .join(" · ");
        toast.warning(`${saved ? "Modificările au fost salvate. " : ""}${okPart}; ${failPart}`);
      } else if (done.length > 0) {
        toast.success(`${base} ${done.map((r) => r.message).join(" · ")}`);
      } else {
        toast.success(base);
      }
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
    { label: "Compartimentare", value: property.layout ?? "" },
    { label: "Confort", value: property.comfort ?? "" },
    { label: "Destinație", value: property.destination ?? "" },
    { label: "Suprafață construită", value: property.built_surface ? `${formatNumber(property.built_surface)} m²` : "" },
    { label: "Suprafață teren", value: property.land_surface ? `${formatNumber(property.land_surface)} m²` : "" },
    { label: "Balcoane", value: property.balconies ? String(property.balconies) : "" },
    { label: "Terase", value: property.terraces ? String(property.terraces) : "" },
    { label: "Orientare", value: property.orientation ?? "" },
    { label: "Tip clădire", value: property.building_type ?? "" },
    { label: "Structură", value: property.building_structure ?? "" },
    { label: "Stare construcție", value: property.construction_stage ?? "" },
    { label: "Renovat în", value: property.renovation_year ? String(property.renovation_year) : "" },
    { label: "Mobilare", value: property.furnishing ?? "" },
    { label: "Parcare", value: property.parking ?? "" },
    { label: "Comision", value: property.commission ?? "" },
    { label: "Sursă", value: property.source ?? "" },
    { label: "Adăugat", value: formatDate(property.created_at) },
  ].filter((item) => item.value);

  const amenityGroups = [
    ...(property.features ?? []),
    ...(property.utilities ?? []),
    ...(property.heating_systems ?? []),
    ...(property.cooling_systems ?? []),
    ...(property.appliances ?? []),
    ...(property.building_amenities ?? []),
    ...(property.kitchen_features ?? []),
    ...(property.misc_features ?? []),
  ].filter(Boolean);

  const usableSurface = property.usable_surface ?? property.total_usable_surface ?? property.surface;
  const isHouse = property.property_type === "house";
  const primaryFacts = [
    { label: "Suprafață utilă", value: usableSurface ? `${formatNumber(usableSurface)} m²` : "" },
    { label: "Camere", value: property.rooms ? String(property.rooms) : "" },
    { label: "Băi", value: property.bathrooms ? String(property.bathrooms) : "" },
    {
      label: isHouse ? "Suprafață teren" : "Etaj",
      value: isHouse
        ? property.land_surface ? `${formatNumber(property.land_surface)} m²` : ""
        : property.floor_label || (property.floor !== null ? `${property.floor}${property.building_floors ? ` din ${property.building_floors}` : ""}` : ""),
    },
    { label: "Compartimentare", value: property.layout ?? "" },
    { label: "An construcție", value: property.build_year ? String(property.build_year) : "" },
  ].filter((item) => item.value);

  const transactionLabel = property.for_sale && property.for_rent
    ? "Vânzare și închiriere"
    : property.for_rent || property.transaction_kind === "rent"
      ? "Închiriere"
      : "Vânzare";
  const salePrice = property.sale_price ?? (property.for_sale ? property.price : null);
  const rentPrice = property.rent_price ?? (property.for_rent || property.transaction_kind === "rent" ? property.price : null);
  const pricePerSqm = usableSurface && salePrice ? Math.round(salePrice / usableSurface) : null;
  const locationLabel = cleanLocation(property.district, property.city);
  const portalCells = portalMatrix.data?.properties[id] ?? [];
  const publishedPortals = portalCells.filter((cell) => cell.state === "published" || cell.state === "in_feed").length;
  const currentNeighborIndex = neighbors.findIndex((row) => row.id === id);
  const previousProperty = currentNeighborIndex > 0 ? neighbors[currentNeighborIndex - 1] : null;
  const nextProperty = currentNeighborIndex >= 0 ? neighbors[currentNeighborIndex + 1] : null;

  /**
   * Fișa de prezentare: identitatea vizuală a agenției plus fotografiile
   * publice ale proprietății (fără cele confidențiale). Tipărirea se face în
   * iframe, după încărcarea imaginilor.
   */
  const printSummary = async (audience: "client" | "agent") => {
    if (printingRef.current) return;
    printingRef.current = true;
    setPresentationDialogOpen(false);

    try {
      const { data: rows, error } = await supabase
        .from("property_images")
        .select("url,storage_path,position,is_primary,is_confidential")
        .eq("property_id", id)
        .eq("is_confidential", false)
        .order("position", { ascending: true });
      if (error) throw error;
      const sorted = [...(rows ?? [])].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.position - b.position;
      });
      const paths = sorted.map((r) => r.storage_path).filter((v): v is string => Boolean(v));
      const signed = paths.length ? await signedUrls(MEDIA_BUCKET, paths) : {};
      const photos = sorted
        .map((r) => (r.storage_path ? signed[r.storage_path] : null) ?? r.url ?? null)
        .filter((v): v is string => Boolean(v));

      await printHtmlDocument(
        buildPresentationHtml(brandingFromOrg(user?.organization, agencyLogoUrl), {
          title: property.title,
          location: [property.address, property.district, property.city].filter(Boolean).join(", "),
          price: formatMoney(property.price, property.currency),
          specs,
          description: property.description,
          photos,
          audience,
          agent: {
            name: user?.profile?.full_name ?? null,
            phone: user?.profile?.phone ?? null,
          },
        }),
      );
    } catch (e) {
      toastError(e as Error);
    } finally {
      printingRef.current = false;
    }
  };

  // Coordonatele arătate în panoul read-only: exacte sau zona aproximativă.
  const mapCoords = publicCoords(property);

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-muted-foreground">
          <Link to="/app/properties" className="hover:text-foreground">Proprietăți</Link>
          <span aria-hidden className="mx-2">/</span>
          <span className="truncate text-foreground">{property.reference ?? "Fără referință"}</span>
        </nav>
        <div className="flex shrink-0 gap-2">
          {previousProperty ? (
            <Button variant="outline" size="compact" asChild>
              <Link to="/app/properties/$id" params={{ id: previousProperty.id }}>
                <ChevronLeft aria-hidden /> {previousProperty.reference ?? "Anterior"}
              </Link>
            </Button>
          ) : null}
          {nextProperty ? (
            <Button variant="outline" size="compact" asChild>
              <Link to="/app/properties/$id" params={{ id: nextProperty.id }}>
                {nextProperty.reference ?? "Următor"} <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <header className="panel overflow-hidden px-6 py-6 sm:px-7">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 max-md:grid-cols-1">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={propertyStatusTone[property.status]} dot>{propertyStatusLabels[property.status]}</StatusBadge>
              <StatusBadge tone="warning">{transactionLabel}</StatusBadge>
              <StatusBadge tone="neutral">{publishedPortals ? `Publicat pe ${publishedPortals} portaluri` : "Nepublicat"}</StatusBadge>
              {property.negotiable ? <StatusBadge tone="info">Negociabil</StatusBadge> : null}
              {property.collaboration ? <StatusBadge tone="primary">{property.collab_commission_percent ? `Colaborare · ${property.collab_commission_percent}%` : "Colaborare"}</StatusBadge> : null}
            </div>
            <h1 className="mt-4 text-[34px] leading-[1.15] font-semibold">{property.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {locationLabel ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" aria-hidden />{locationLabel}</span> : null}
              {property.reference ? <><span aria-hidden>·</span><span>{property.reference}</span></> : null}
              {responsibleAgent?.full_name ? <><span aria-hidden>·</span><span>Agent: {responsibleAgent.full_name}</span></> : null}
            </div>
          </div>
          <div className="text-right max-md:text-left">
            {salePrice ? <p className="font-display text-[38px] leading-none font-semibold">{formatMoney(salePrice, property.sale_currency ?? property.currency)}</p> : null}
            {rentPrice ? <p className={salePrice ? "mt-2 font-display text-xl font-semibold" : "font-display text-[38px] leading-none font-semibold"}>{formatMoney(rentPrice, property.rent_currency ?? property.currency)} <span className="font-sans text-base font-normal text-muted-foreground">/ lună</span></p> : null}
            {usableSurface ? <p className="mt-3 text-sm text-muted-foreground">{pricePerSqm ? `${formatNumber(pricePerSqm)} €/m² · ` : ""}{formatNumber(usableSurface)} m² utili</p> : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
          {editing ? <Button variant="outline" onClick={() => setEditing(false)}>Anulează</Button> : <Button variant="outline" onClick={() => { startEdit(); setTab("overview"); }}><Pencil /> Editează</Button>}
          <Button variant="outline" onClick={() => setActivityDialog({ open: true, kind: "viewing" })}><CalendarPlus /> Programează vizionare</Button>
          <Button variant="outline" onClick={() => setActivityDialog({ open: true, kind: "call" })}>Adaugă activitate</Button>
          <Button variant="outline" onClick={() => setTab("acp")}><BarChart3 /> Analiză comparativă de piață (ACP)</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label="Mai multe acțiuni"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>Clonează</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPresentationDialogOpen(true)}><Printer /> Generează fișă de vizionare</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddClientOpen(true)}><UserPlus /> Adaugă client</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {Object.entries(propertyStatusLabels).map(([key, label]) => <DropdownMenuItem key={key} onClick={() => isWithdrawStatus(key) ? setPendingStatus(key as "sold" | "rented" | "archived") : changeStatus.mutate(key)}>{label}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              {property.status === "archived" ? <DropdownMenuItem onClick={() => unarchive.mutate()}>Dezarhivează</DropdownMenuItem> : <DropdownMenuItem onClick={() => setArchiveOpen(true)}>Arhivează</DropdownMenuItem>}
              {canDeleteProperty(user, property) ? <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>Șterge anunțul</DropdownMenuItem></> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <StatusChangeDialog
        propertyIds={[id]}
        status={pendingStatus}
        statusLabel={pendingStatus ? (propertyStatusLabels[pendingStatus] ?? pendingStatus) : ""}
        pending={changeStatus.isPending}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => pendingStatus && changeStatus.mutate(pendingStatus)}
      />
      <ArchivePropertyDialog
        propertyId={id}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={() => navigate({ to: "/app/properties" })}
      />
      <DeletePropertyDialog
        propertyId={id}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate({ to: "/app/properties" })}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="sticky top-0 z-40 -mx-1 overflow-x-auto bg-background px-1">
        <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0" aria-label="Secțiunile proprietății">
          {[
            ["overview", "Prezentare"],
            ["media", `Poze (${data?.imageCount ?? 0})`],
            ["publishing", `Publicare (${publishedPortals}/${portalCells.length})`],
            ["promotion", "Promovare"],
            ["leads", `Lead-uri (${data?.leads.length ?? 0})`],
            ["matching", `Cereri compatibile (${matches.length})`],
            ["activities", `Activități (${activities.length})`],
            ["documents", "Documente"],
            ["acp", "ACP"],
            ["marketing", "Marketing AI"],
            ["history", "Istoric"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value as string}
              className="rounded-none border-b-[3px] border-transparent bg-transparent px-3 py-2.5 font-normal shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {editing ? (
            <form
              id="property-details-form"
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
                    ["district", "Zonă"],
                    ["address", "Adresă"],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>
                        {label}
                        {key === "title" ? <RequiredMark /> : null}
                      </Label>
                      <Input
                        id={key}
                        value={draft[key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Cod poștal</Label>
                    <Input
                      id="postal_code"
                      inputMode="numeric"
                      value={draft.postal_code ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, postal_code: e.target.value }))}
                    />
                    {(draft.postal_code ?? "").trim() === (property.postal_code ?? "").trim() &&
                    postalCodeHint(property.postal_code_source) ? (
                      <p className="text-xs text-muted-foreground">
                        {postalCodeHint(property.postal_code_source)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <PropertyLocationMap
                  idPrefix="edit"
                  seed={property.id}
                  lat={coords?.lat ?? null}
                  lng={coords?.lng ?? null}
                  precise={locationPrecise}
                  addressParts={[
                    draft.address,
                    draft.district,
                    location.localityName || draft.city,
                    location.countyName,
                  ]}
                  onCoordsChange={setCoords}
                  onPreciseChange={setLocationPrecise}
                />
              </FormSection>

              <FormSection
                title="Tranzacție și preț"
                description="Alege vânzare, închiriere sau ambele."
              >
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

              <FormSection
                title="Detalii complete"
                description="Tip, camere, băi, etaj, suprafețe, an construcție și facilități."
              >
                <PropertyDetailsFields
                  idPrefix="edit"
                  value={details}
                  onChange={(patch) => setDetails((d) => ({ ...d, ...patch }))}
                />
              </FormSection>

              <FormSection
                title="Note interne"
                description="Nu se publică pe site sau pe portaluri."
              >
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
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_352px]">
              <div className="min-w-0 space-y-5">
                <PropertyHeroGallery propertyId={id} title={property.title} onAddPhotos={() => setTab("media")} />

                {primaryFacts.length > 0 ? (
                  <section className="panel grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6" aria-label="Date principale">
                    {primaryFacts.map((fact, index) => (
                      <div key={fact.label} className={`px-4 py-4 ${index > 0 ? "border-l border-border" : ""}`}>
                        <p className="text-xs text-muted-foreground">{fact.label}</p>
                        <p className="mt-1 text-lg font-bold">{fact.value}</p>
                      </div>
                    ))}
                  </section>
                ) : null}

                <section className="panel p-5 sm:p-6">
                  <h2 className="text-[21px] leading-tight">Descriere</h2>
                  <p className={`mt-4 text-sm leading-6 whitespace-pre-line text-muted-foreground ${descriptionExpanded ? "" : "line-clamp-8"}`}>
                    {property.description || "Nu există descriere."}
                  </p>
                  {property.description ? <Button type="button" variant="link" className="mt-3 p-0" onClick={() => setDescriptionExpanded((value) => !value)}>{descriptionExpanded ? "Restrânge descrierea" : "Citește toată descrierea"}</Button> : null}
                  {property.internal_notes ? (
                    <div className="mt-5 rounded-xl bg-muted p-4 text-sm">
                      <p className="font-bold">Note interne (vizibile doar în CRM)</p>
                      <p className="mt-1 whitespace-pre-line text-muted-foreground">{property.internal_notes}</p>
                    </div>
                  ) : null}
                </section>

                {(specs.length > 0 || amenityGroups.length > 0) ? (
                  <section className="panel p-5 sm:p-6">
                    <h2 className="text-[21px] leading-tight">Specificații</h2>
                    <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
                      {(specsExpanded ? specs : specs.slice(0, 8)).map((spec) => (
                        <div key={spec.label} className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm">
                          <dt className="text-muted-foreground">{spec.label}</dt>
                          <dd className="text-right font-bold">{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {specsExpanded && amenityGroups.length > 0 ? <div className="mt-5 flex flex-wrap gap-2">{amenityGroups.map((item, index) => <span key={`${item}-${index}`} className="rounded-full border border-border bg-muted px-3 py-1 text-xs">{item}</span>)}</div> : null}
                    {(specs.length > 8 || amenityGroups.length > 0) ? <Button type="button" variant="link" className="mt-4 p-0" onClick={() => setSpecsExpanded((value) => !value)}>{specsExpanded ? "Restrânge caracteristicile" : "Vezi toate caracteristicile"}</Button> : null}
                  </section>
                ) : null}

                <section className="panel p-5 sm:p-6">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                    <h2 className="text-[21px] leading-tight">Locație</h2>
                    <p className="max-w-md text-right text-sm text-muted-foreground">{[property.address, locationLabel].filter(Boolean).join(", ")}</p>
                  </div>
                  {mapCoords ? <PropertyMapClient lat={mapCoords.lat} lng={mapCoords.lng} precise={mapCoords.precise} seed={property.id} className="mt-4 h-[220px] w-full overflow-hidden rounded-xl border border-border" /> : <div className="mt-4 flex h-[220px] items-center justify-center rounded-xl border border-border bg-muted text-sm text-muted-foreground">Nu există coordonate GPS pentru această proprietate.</div>}
                  {mapCoords && !mapCoords.precise ? <p className="mt-2 text-xs text-muted-foreground">Hartă estimativă — zonă de aproximativ {APPROX_RADIUS_M} m.</p> : null}
                </section>
              </div>

              <aside className="space-y-4">
                <section className="panel px-5 py-[18px]">
                  <div className="flex items-center justify-between gap-3"><h2 className="font-sans text-base font-bold">Pe portaluri</h2><span className="text-sm text-muted-foreground">{publishedPortals} din {portalCells.length} activate</span></div>
                  {portalCells.length > 0 ? <ul className="mt-4 space-y-3">{portalCells.map((cell) => { const state = portalState(cell); return <li key={cell.portalId} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{cell.portalName}</span><span className="flex shrink-0 items-center gap-2"><StatusBadge tone={state.tone} dot>{state.label}</StatusBadge>{cell.promoted ? <StatusBadge tone="warning">Promovat</StatusBadge> : null}</span></li>; })}</ul> : <p className="mt-3 text-sm text-muted-foreground">Niciun portal activat pentru agenție.</p>}
                  <Button variant="outline" className="mt-4 w-full" onClick={() => setTab("publishing")}>Gestionează publicarea</Button>
                </section>

                <section className="panel px-5 py-[18px]">
                  <h2 className="font-sans text-base font-bold">Următorul pas</h2>
                  {upcoming ? <div className="mt-3 text-sm"><p className="font-bold">{upcoming.title}</p><p className="mt-1 text-muted-foreground">{formatDateTime(upcoming.starts_at)}</p></div> : <p className="mt-3 text-sm text-muted-foreground">Nicio activitate programată pentru această proprietate.</p>}
                  <div className="mt-4 grid gap-2"><Button variant="soft" onClick={() => setActivityDialog({ open: true, kind: "viewing" })}>Programează vizionare</Button><Button variant="outline" onClick={() => setActivityDialog({ open: true, kind: "call" })}>Adaugă activitate</Button></div>
                </section>

                <section className="panel px-5 py-[18px]">
                  <h2 className="font-sans text-base font-bold">Interes</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={() => setTab("leads")} className="h-auto items-start p-3 text-left"><span><span className="block text-[22px] font-bold">{activeLeads.length}</span><span className="text-xs font-normal text-muted-foreground">Lead-uri active</span></span></Button>
                    <Button type="button" variant="outline" onClick={() => setTab("matching")} className="h-auto items-start p-3 text-left"><span><span className="block text-[22px] font-bold">{matches.length}</span><span className="text-xs font-normal text-muted-foreground">Cereri compatibile</span></span></Button>
                  </div>
                  {matches.length > 0 ? <div className="mt-4"><p className="text-sm font-bold">Top potriviri</p><ul className="mt-2 space-y-2">{matches.slice(0, 3).map(({ request, match }) => <li key={request.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{request.title}</span><StatusBadge tone={matchTone(match.score)}>{match.score}%</StatusBadge></li>)}</ul></div> : null}
                </section>

                {responsibleAgent || user?.isAdmin ? <section className="panel px-5 py-[18px]"><div className="flex items-center justify-between gap-2"><h2 className="font-sans text-base font-bold">Agent responsabil</h2>{user?.isAdmin && property ? <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>Schimbă agentul</Button> : null}</div>{responsibleAgent ? <div className="mt-4 flex items-center gap-3"><UserAvatar name={responsibleAgent.full_name} path={responsibleAgent.avatar_url} className="size-11" /><div className="min-w-0"><p className="truncate text-sm font-bold">{responsibleAgent.full_name}</p><p className="truncate text-xs text-muted-foreground">{[responsibleAgent.job_title, responsibleAgent.phone].filter(Boolean).join(" · ") || "Agent"}</p></div></div> : <p className="mt-3 text-xs text-muted-foreground">Fără agent responsabil.</p>}</section> : null}
                {user?.isAdmin && property ? (
                  <ReassignPropertiesDialog
                    open={reassignOpen}
                    onOpenChange={setReassignOpen}
                    title="Schimbă agentul"
                    candidates={orgMembers}
                    excludeUserId={property.assigned_to}
                    loadIds={async () => [property.id]}
                    onDone={() => {
                      queryClient.invalidateQueries({ queryKey: ["property", id] });
                      queryClient.invalidateQueries({ queryKey: ["properties"] });
                      queryClient.invalidateQueries({ queryKey: ["property-responsible-agent"] });
                    }}
                  />
                ) : null}

                <section className="panel px-5 py-[18px]">
                  <h2 className="font-sans text-base font-bold">Proprietar</h2>
                  {ownerContact ? <><div className="mt-3 text-sm"><Link to="/app/contacts/$id" params={{ id: ownerContact.id }} className="font-bold hover:text-primary">{ownerContact.first_name} {ownerContact.last_name}</Link><p className="mt-1 text-muted-foreground">{ownerContact.phone ?? "Fără telefon"}</p></div><div className="mt-4 grid grid-cols-2 gap-2">{ownerContact.phone ? <Button variant="outline" asChild><a href={`tel:${ownerContact.phone}`}><Phone /> Sună</a></Button> : null}{(ownerContact.whatsapp ?? ownerContact.phone) ? <Button variant="outline" asChild><a href={`https://wa.me/${(ownerContact.whatsapp ?? ownerContact.phone ?? "").replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button> : null}</div></> : <><p className="mt-3 text-sm text-muted-foreground">Niciun proprietar asociat</p><Button variant="outline" className="mt-4 w-full" onClick={() => { startEdit(); setTab("overview"); }}>Adaugă proprietar</Button></>}
                </section>

                {recentActivities.length > 0 ? <section className="panel px-5 py-[18px]"><h2 className="font-sans text-base font-bold">Activități recente</h2><ul className="mt-3 space-y-3">{recentActivities.map((activity) => <li key={activity.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{activity.title}</span><StatusBadge tone={activityStatusTone[activity.status]}>{activityStatusLabels[activity.status]}</StatusBadge></li>)}</ul></section> : null}
              </aside>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="media">
          <PropertyMediaManager propertyId={id} orgId={orgId} userId={user?.userId} />
        </TabsContent>

        <TabsContent value="acp">
          <PropertyAcpCard propertyId={id} />
        </TabsContent>

        <TabsContent value="marketing">
          <MarketingAgentPanel propertyId={id} />
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
              <EmptyState
                icon={Sparkles}
                title="Nicio cerere potrivită"
                description="Când vor apărea cereri compatibile, le vezi aici automat."
              />
            ) : (
              <ul className="divide-y divide-border">
                {matches.map(({ request, match }) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
                  >
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

        <TabsContent value="activities">
          <div className="panel overflow-hidden">
            {activities.length === 0 ? (
              <EmptyState title="Nicio activitate înregistrată" />
            ) : (
              <ul className="divide-y divide-border">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone={activityStatusTone[a.status]}>
                      {activityKindLabels[a.kind]}
                    </StatusBadge>
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(a.starts_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel entityType="property" entityId={id} orgId={orgId} />
        </TabsContent>

        <TabsContent
          forceMount
          value="publishing"
          className="space-y-4 data-[state=inactive]:hidden"
        >
          <PropertyPortalsCard
            ref={portalsRef}
            propertyId={id}
            assignedTo={property.assigned_to}
            editing={editing}
            publishPending={publish.isPending || save.isPending}
            onPublish={() => publish.mutate()}
            onOpenMedia={() => setTab("media")}
            onCompleteMissing={() => {
              setEditing(true);
              setTab("overview");
              requestAnimationFrame(() =>
                document
                  .getElementById("property-details-form")
                  ?.scrollIntoView({ behavior: "smooth" }),
              );
            }}
          />
        </TabsContent>

        <TabsContent value="promotion">
          <PropertyPromotionTab propertyId={id} onOpenPublishing={() => setTab("publishing")} />
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

      <Dialog open={presentationDialogOpen} onOpenChange={setPresentationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generează fișa de vizionare</DialogTitle>
            <DialogDescription>Alege cui îi este destinată fișa.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-auto min-h-24 flex-col items-start gap-1 whitespace-normal p-4 text-left"
              onClick={() => void printSummary("client")}
            >
              <span className="font-semibold">Pentru client</span>
              <span className="text-xs font-normal text-muted-foreground">
                Include telefoanele agenției și agentului.
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto min-h-24 flex-col items-start gap-1 whitespace-normal p-4 text-left"
              onClick={() => void printSummary("agent")}
            >
              <span className="font-semibold">Pentru alt agent</span>
              <span className="text-xs font-normal text-muted-foreground">
                Nu include niciun număr de telefon.
              </span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPresentationDialogOpen(false)}>
              Anulează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă client (lead)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nume</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Telefon</Label>
              <Input
                id="client-phone"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
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
