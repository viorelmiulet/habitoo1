/**
 * Încărcarea datelor reale pentru validarea pre-publicare.
 *
 * Citim exact ce trimit mapper-ele: oferta, numărul de imagini, agentul asignat
 * și telefonul de contact (agent, altfel agenție). Nicio valoare nu este
 * completată implicit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { imo24BlockingReasons } from "./imo24/mapper";
import {
  validatePortalRequirements,
  type PortalRequirementReport,
  type PortalRequirementSubject,
} from "./requirements";
import { resolveImobiliareContactPhone, resolveImobiliareWhatsapp } from "./imobiliare/contact";

type Admin = SupabaseClient<any, any, any>;

/** Imopedia: motivele blocante doar când agenția are conexiune Imopedia (evită încărcarea nomenclatorului altfel). */
async function imopediaReasonsLoader(admin: Admin, organizationId: string, propertyIds: string[]) {
  const { data: conn } = await admin
    .from("portal_connections")
    .select("settings")
    .eq("organization_id", organizationId)
    .eq("portal", "imopedia")
    .maybeSingle();
  if (!conn) return null;
  const [{ loadImopediaNomenclature, imopediaMapContext }, { imopediaBlockingReasons }, { parseImopediaAgencyId }] = await Promise.all([
    import("./imopedia/context.server"),
    import("./imopedia/publish"),
    import("./imopedia/config"),
  ]);
  const nomenclature = await loadImopediaNomenclature(admin as any);
  const agencyId = parseImopediaAgencyId(((conn as any).settings ?? {})["agency_id"]) ?? 0;
  const { data: listings } = await admin
    .from("portal_listings")
    .select("property_id, external_id")
    .eq("organization_id", organizationId)
    .eq("portal", "imopedia");
  const { data: pubImages } = await admin
    .from("property_images")
    .select("property_id")
    .eq("organization_id", organizationId)
    .eq("include_in_publish", true)
    .eq("is_confidential", false)
    .in("property_id", propertyIds);
  const imageCount = new Map<string, number>();
  for (const i of (pubImages ?? []) as any[]) imageCount.set(i.property_id, (imageCount.get(i.property_id) ?? 0) + 1);
  const ext = new Map(((listings ?? []) as any[]).map((l) => [l.property_id as string, (l.external_id as string | null) ?? null]));
  return (row: Record<string, any>, profile: any) =>
    imopediaBlockingReasons({
      row: row as never,
      ctx: imopediaMapContext(row, agencyId, nomenclature),
      agent: row.assigned_to && profile ? { userId: row.assigned_to, fullName: profile.full_name ?? null, email: profile.email ?? null, phone: profile.phone ?? null } : null,
      externalId: ext.get(row.id) ?? null,
      imageCount: imageCount.get(row.id) ?? 0,
    });
}

export async function loadRequirementSubject(
  admin: Admin,
  organizationId: string,
  propertyId: string,
): Promise<PortalRequirementSubject | null> {
  const { data: property } = await admin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!property) return null;
  const row = property as Record<string, any>;

  const [{ count }, { data: org }] = await Promise.all([
    admin
      .from("property_images")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId),
    admin
      .from("organizations")
      .select("phone, material_phone")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  const imopedia = await imopediaReasonsLoader(admin, organizationId, [propertyId]);
  let agentProfile: any = null;
  let agentName: string | null = null;
  let agentEmail: string | null = null;
  let agentPhone: string | null = null;
  if (row.assigned_to) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", row.assigned_to)
      .maybeSingle();
    if (profile) {
      agentProfile = profile;
      agentName = (profile as any).full_name ?? null;
      agentEmail = (profile as any).email ?? null;
      agentPhone = (profile as any).phone ?? null;
    }
  }

  const forSale = row.for_sale === true || row.transaction_kind === "sale";
  const forRent = row.for_rent === true || row.transaction_kind === "rent";
  const price = forSale ? (row.sale_price ?? row.price) : (row.rent_price ?? row.price);
  const currency = forSale
    ? (row.sale_currency ?? row.currency)
    : (row.rent_currency ?? row.currency);

  return {
    title: row.title ?? null,
    description: row.description ?? null,
    propertyType: row.property_type ?? null,
    forSale,
    forRent,
    price: typeof price === "number" ? price : null,
    currency: currency ?? null,
    city: row.city ?? null,
    county: row.county ?? null,
    address: row.address ?? null,
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    imageCount: count ?? 0,
    rooms: row.rooms ?? null,
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms ?? null,
    buildYear: row.build_year ?? null,
    usableSurface: row.usable_surface ?? row.surface ?? null,
    landSurface: row.land_surface ?? null,
    builtSurface: row.built_surface ?? null,
    layout: row.layout ?? null,
    heatingSystems: Array.isArray(row.heating_systems)
      ? (row.heating_systems as unknown[]).map((item) => String(item))
      : null,
    floor: typeof row.floor === "number" ? row.floor : null,
    floorLabel: row.floor_label ?? null,
    agentName,
    agentEmail,
    contactPhone:
      resolveImobiliareWhatsapp(agentPhone) ?? resolveImobiliareContactPhone(agentPhone),
    imo24Reasons: imo24BlockingReasons(row as any),
    ...(imopedia ? { imopediaReasons: imopedia(row, agentProfile) } : {}),
  };
}

/**
 * Varianta în lot a lui `loadRequirementSubject`, pentru grilele cu multe
 * oferte (publicarea în masă): 3 interogări totale, nu câte una per ofertă.
 */
export async function loadRequirementSubjects(
  admin: Admin,
  organizationId: string,
  propertyIds: string[],
): Promise<Map<string, PortalRequirementSubject>> {
  const result = new Map<string, PortalRequirementSubject>();
  if (propertyIds.length === 0) return result;

  const [{ data: properties }, { data: images }, { data: org }] = await Promise.all([
    admin
      .from("properties")
      .select("*")
      .eq("organization_id", organizationId)
      .in("id", propertyIds),
    admin
      .from("property_images")
      .select("property_id")
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds),
    admin
      .from("organizations")
      .select("phone, material_phone")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  void org;

  const imageCounts = new Map<string, number>();
  for (const image of images ?? []) {
    const pid = (image as any).property_id as string;
    imageCounts.set(pid, (imageCounts.get(pid) ?? 0) + 1);
  }

  const agentIds = [
    ...new Set(
      (properties ?? [])
        .map((p: any) => p.assigned_to as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: profiles } = agentIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", agentIds)
    : { data: [] as any[] };
  const imopedia = await imopediaReasonsLoader(admin, organizationId, propertyIds);
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id as string, p]));

  for (const property of properties ?? []) {
    const row = property as Record<string, any>;
    const profile = row.assigned_to ? profileById.get(row.assigned_to) : null;
    const agentPhone = (profile as any)?.phone ?? null;
    const forSale = row.for_sale === true || row.transaction_kind === "sale";
    const forRent = row.for_rent === true || row.transaction_kind === "rent";
    const price = forSale ? (row.sale_price ?? row.price) : (row.rent_price ?? row.price);
    const currency = forSale
      ? (row.sale_currency ?? row.currency)
      : (row.rent_currency ?? row.currency);
    result.set(row.id as string, {
      title: row.title ?? null,
      description: row.description ?? null,
      propertyType: row.property_type ?? null,
      forSale,
      forRent,
      price: typeof price === "number" ? price : null,
      currency: currency ?? null,
      city: row.city ?? null,
      county: row.county ?? null,
      address: row.address ?? null,
      lat: typeof row.lat === "number" ? row.lat : null,
      lng: typeof row.lng === "number" ? row.lng : null,
      imageCount: imageCounts.get(row.id as string) ?? 0,
      rooms: row.rooms ?? null,
      bedrooms: row.bedrooms ?? null,
      bathrooms: row.bathrooms ?? null,
      buildYear: row.build_year ?? null,
      usableSurface: row.usable_surface ?? row.surface ?? null,
      landSurface: row.land_surface ?? null,
      builtSurface: row.built_surface ?? null,
      layout: row.layout ?? null,
      heatingSystems: Array.isArray(row.heating_systems)
        ? (row.heating_systems as unknown[]).map((item) => String(item))
        : null,
      floor: typeof row.floor === "number" ? row.floor : null,
      floorLabel: row.floor_label ?? null,
      agentName: (profile as any)?.full_name ?? null,
      agentEmail: (profile as any)?.email ?? null,
      contactPhone:
        resolveImobiliareWhatsapp(agentPhone) ?? resolveImobiliareContactPhone(agentPhone),
      imo24Reasons: imo24BlockingReasons(row as any),
      ...(imopedia ? { imopediaReasons: imopedia(row, profile) } : {}),
    });
  }
  return result;
}

/** Raportul pre-publicare pentru un portal, pe datele reale ale ofertei. */
export async function portalRequirementReport(
  admin: Admin,
  organizationId: string,
  propertyId: string,
  portalId: string,
): Promise<PortalRequirementReport | null> {
  const subject = await loadRequirementSubject(admin, organizationId, propertyId);
  if (!subject) return null;
  return validatePortalRequirements(portalId, subject);
}
