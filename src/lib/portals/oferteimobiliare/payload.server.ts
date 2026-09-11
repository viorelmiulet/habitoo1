/**
 * Construcția payload-urilor OferteImobiliare.ro pentru o ofertă (server-only).
 * Aceleași reguli de eligibilitate ca feedul public: o ofertă nepublicabilă sau
 * cu imagini confidențiale nu ajunge la portal.
 */
import { CRM_URL } from "@/lib/host";
import {
  isPropertyFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import { mapPropertyToOferteImobiliare, type OiListing } from "./mapper";
import { resolveOiLocation, type OiGeoData } from "./geo.server";

export type OiPayloadBuild =
  { ok: true; listings: OiListing[]; warnings: string[] } | { ok: false; reasons: string[] };

export async function buildOiPayload(input: {
  organizationId: string;
  propertyId: string;
  geo: OiGeoData | null;
}): Promise<OiPayloadBuild> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("id", input.propertyId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!property) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };

  const row = property as PropertyRow;
  if (!isPropertyFeedEligible(row)) {
    return {
      ok: false,
      reasons: ["Oferta nu este publicabilă: verifică statusul și publicarea pe site."],
    };
  }

  const [{ data: images }, { data: org }, agentResult] = await Promise.all([
    supabaseAdmin
      .from("property_images")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("property_id", input.propertyId),
    supabaseAdmin.from("organizations").select("name").eq("id", input.organizationId).maybeSingle(),
    row.assigned_to
      ? supabaseAdmin
          .from("profiles")
          .select("full_name, email, phone")
          .eq("id", row.assigned_to)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!input.geo) {
    return {
      ok: false,
      reasons: [
        "Listele de județe, orașe și zone ale portalului nu au putut fi citite. Testează conexiunea și reia publicarea.",
      ],
    };
  }

  const result = mapPropertyToOferteImobiliare(row, {
    baseUrl: CRM_URL,
    offerUrl: `${CRM_URL}/oferta/${row.id}`,
    images: (images ?? []) as PropertyImageRow[],
    agent: (agentResult.data ?? null) as Pick<ProfileRow, "full_name" | "email" | "phone"> | null,
    agencyName: org?.name ?? null,
    location: resolveOiLocation(input.geo, {
      county: row.county ?? null,
      city: row.city ?? null,
      district: row.district ?? null,
    }),
  });

  if (!result.ok) return { ok: false, reasons: result.reasons };
  return { ok: true, listings: result.listings, warnings: result.warnings };
}
