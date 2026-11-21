// Server function publică pentru pagina de ofertă de pe site (/oferta/{id}).
// Fără token și fără sesiune: expune STRICT proprietățile publicate și
// fotografiile marcate ca publicabile și neconfidențiale.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isUuid, isOfferIndexable, offerCanonicalUrl, type OfferEligibility } from "@/lib/marketing/offer-seo";
import { brandingFromOrg, type MaterialBranding } from "@/lib/materials";

export type PublicOfferImage = { id: string; alt: string | null; isPrimary: boolean; width?: number | null; height?: number | null };

export type PublicOffer = {
  id: string;
  reference: string | null;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  transactionKind: string;
  propertyType: string;
  status: string;
  rooms: number | null;
  bathrooms: number | null;
  surface: number | null;
  usableSurface: number | null;
  landSurface: number | null;
  floor: number | null;
  buildYear: number | null;
  city: string | null;
  county: string | null;
  district: string | null;
  features: string[];
  utilities: string[];
  images: PublicOfferImage[];
  agencyName: string | null;
  /** Identitatea vizuală a agenției, aplicată pe materialele către clienți. */
  branding: MaterialBranding;
  updatedAt: string;
  /** Stable public address; null only before the first publication. */
  slug: string | null;
  /** Eligible for search indexing (visible agency, published, active). */
  indexable: boolean;
  /** Absolute canonical URL (an eligible original for development copies). */
  canonicalUrl: string | null;
};

export const getPublicOffer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<PublicOffer | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq(isUuid(data.id) ? "id" : "public_slug", isUuid(data.id) ? data.id : data.id.toLowerCase())
      .eq("publish_status", "published")
      .is("deleted_at", null)
      .in("status", ["active", "reserved", "negotiation"])
      .limit(1);
    if (error) throw error;
    const property = rows?.[0];
    if (!property) return null;

    const [images, org] = await Promise.all([
      supabaseAdmin
        .from("property_images")
        .select("id, alt, is_primary, position, width, height")
        .eq("property_id", property.id)
        .eq("include_in_publish", true)
        .eq("is_confidential", false)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("organizations")
        .select(
          "name, phone, email, logo_path, public_hidden_by_admin, material_accent_color, material_phone, material_email, material_website, material_address, material_show_habitoo",
        )
        .eq("id", property.organization_id)
        .maybeSingle(),
    ]);

    const eligibility = (row: { publish_status: string; status: string; deleted_at: string | null; archived_at: string | null; public_slug: string | null }, hidden: boolean): OfferEligibility =>
      ({ publishStatus: row.publish_status, status: row.status, deletedAt: row.deleted_at, archivedAt: row.archived_at, slug: row.public_slug, agencyHidden: hidden });
    const indexable = isOfferIndexable(eligibility(property, Boolean(org.data?.public_hidden_by_admin)));
    let original: OfferEligibility | null = null;
    if (property.cloned_from_property_id) {
      const { data: o } = await supabaseAdmin.from("properties").select("publish_status, status, deleted_at, archived_at, public_slug, organizations(public_hidden_by_admin)").eq("id", property.cloned_from_property_id).maybeSingle();
      if (o) original = eligibility(o, Boolean((o.organizations as { public_hidden_by_admin?: boolean } | null)?.public_hidden_by_admin));
    }
    const canonicalUrl = property.public_slug ? offerCanonicalUrl(property.public_slug, original) : null;

    // Bucket privat: destinatarii primesc un link semnat, regenerat la fiecare afișare.
    let logoUrl: string | null = null;
    if (org.data?.logo_path) {
      const signed = await supabaseAdmin.storage
        .from("agency-logos")
        .createSignedUrl(org.data.logo_path, 7 * 24 * 3600);
      logoUrl = signed.data?.signedUrl ?? null;
    }

    return {
      id: property.id,
      reference: property.reference,
      title: property.title,
      description: property.description,
      price: property.price,
      currency: property.currency,
      transactionKind: property.transaction_kind,
      propertyType: property.property_type,
      status: property.status,
      rooms: property.rooms,
      bathrooms: property.bathrooms,
      surface: property.surface,
      usableSurface: property.usable_surface,
      landSurface: property.land_surface,
      floor: property.floor,
      buildYear: property.build_year,
      city: property.city,
      county: property.county,
      district: property.district,
      features: property.features ?? [],
      utilities: property.utilities ?? [],
      images: (images.data ?? [])
        .sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1))
        .map((img) => ({ id: img.id, alt: img.alt, isPrimary: Boolean(img.is_primary), width: img.width ?? null, height: img.height ?? null })),
      agencyName: org.data?.name ?? null,
      branding: brandingFromOrg(org.data, logoUrl),
      updatedAt: property.updated_at,
      slug: property.public_slug,
      indexable,
      canonicalUrl,
    };
  });
