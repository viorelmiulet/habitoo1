/**
 * Construcția payload-urilor Storia pentru o ofertă (server-only).
 * Aceleași reguli de eligibilitate ca feedul public: o ofertă nepublicată sau
 * cu imagini confidențiale nu ajunge la portal.
 */
import { CRM_URL } from "@/lib/host";
import {
  isPropertyFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import { mapPropertyToStoria, type StoriaListing } from "./mapper";

export type StoriaPayloadBuild =
  | { ok: true; listings: StoriaListing[]; warnings: string[] }
  | { ok: false; reasons: string[] };

export async function buildStoriaPayload(input: {
  organizationId: string;
  propertyId: string;
}): Promise<StoriaPayloadBuild> {
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
    // Mesaj explicit: agentul trebuie să știe exact ce blochează publicarea.
    const reasons: string[] = [];
    if (row.deleted_at) reasons.push("Oferta este ștearsă.");
    if (row.publish_status !== "published") {
      reasons.push("Oferta nu este publicată pe site (apasă „Publică” pe fișa ofertei).");
    }
    if (row.status === "draft") {
      reasons.push("Statusul ofertei este „Ciornă”; schimbă-l în „Activ” pentru a publica pe portaluri.");
    } else if (!["active", "reserved", "negotiation"].includes(row.status)) {
      reasons.push(`Statusul ofertei („${row.status}”) nu permite publicarea pe portaluri.`);
    }
    return {
      ok: false,
      reasons: reasons.length > 0 ? reasons : ["Oferta nu este publicabilă pe portaluri."],
    };
  }

  const [{ data: images }, { data: org }, agentResult] = await Promise.all([
    supabaseAdmin
      .from("property_images")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("property_id", input.propertyId),
    supabaseAdmin
      .from("organizations")
      .select("phone, email")
      .eq("id", input.organizationId)
      .maybeSingle(),
    row.assigned_to
      ? supabaseAdmin
          .from("profiles")
          .select("full_name, email, phone")
          .eq("id", row.assigned_to)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const result = mapPropertyToStoria(row, {
    baseUrl: CRM_URL,
    images: (images ?? []) as PropertyImageRow[],
    agent: (agentResult.data ?? null) as Pick<ProfileRow, "full_name" | "email" | "phone"> | null,
    organizationPhone: org?.phone ?? null,
    organizationEmail: org?.email ?? null,
  });

  if (!result.ok) return { ok: false, reasons: result.reasons };
  return { ok: true, listings: result.listings, warnings: result.warnings };
}
