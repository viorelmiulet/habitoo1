// Server function publică pentru pagina de ofertă de pe site (/oferta/{id}).
// Fără token și fără sesiune: expune STRICT proprietățile publicate și
// fotografiile marcate ca publicabile și neconfidențiale.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { brandingFromOrg, type MaterialBranding } from "@/lib/materials";

export type PublicOfferImage = { id: string; alt: string | null; isPrimary: boolean };

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
};

export const getPublicOffer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<PublicOffer | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", data.id)
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
        .select("id, alt, is_primary, position")
        .eq("property_id", property.id)
        .eq("include_in_publish", true)
        .eq("is_confidential", false)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("organizations")
        .select(
          "name, phone, email, logo_path, material_accent_color, material_phone, material_email, material_website, material_address, material_show_habitoo",
        )
        .eq("id", property.organization_id)
        .maybeSingle(),
    ]);

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
        .map((img) => ({ id: img.id, alt: img.alt, isPrimary: Boolean(img.is_primary) })),
      agencyName: org.data?.name ?? null,
      branding: brandingFromOrg(org.data, logoUrl),
      updatedAt: property.updated_at,
    };
  });
