/**
 * Încărcarea datelor reale pentru validarea pre-publicare.
 *
 * Citim exact ce trimit mapper-ele: oferta, numărul de imagini, agentul asignat
 * și telefonul de contact (agent, altfel agenție). Nicio valoare nu este
 * completată implicit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  validatePortalRequirements,
  type PortalRequirementReport,
  type PortalRequirementSubject,
} from "./requirements";
import { resolveImobiliareContactPhone, resolveImobiliareWhatsapp } from "./imobiliare/contact";

type Admin = SupabaseClient<any, any, any>;

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
    agentName,
    agentEmail,
    contactPhone:
      resolveImobiliareWhatsapp(agentPhone, (org as any)?.phone, (org as any)?.material_phone) ??
      resolveImobiliareContactPhone(agentPhone, (org as any)?.phone, (org as any)?.material_phone),
  };
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
