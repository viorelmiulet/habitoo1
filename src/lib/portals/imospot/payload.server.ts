/**
 * Construcția payload-urilor Imospot pentru o ofertă (server-only).
 * Reutilizează exact aceleași reguli de eligibilitate ca feedul public:
 * o ofertă nepublicată sau cu imagini confidențiale nu ajunge la portal.
 */
import { CRM_URL } from "@/lib/host";
import {
  isPropertyFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import { mapPropertyToImospot, type ImospotMapResult } from "./mapper";

export type ImospotPayloadBuild =
  | { ok: true; listings: NonNullable<Extract<ImospotMapResult, { ok: true }>["listings"]>; warnings: string[] }
  | { ok: false; reasons: string[] };

export async function buildImospotPayload(input: {
  organizationId: string;
  propertyId: string;
}): Promise<ImospotPayloadBuild> {
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
    supabaseAdmin.from("organizations").select("phone").eq("id", input.organizationId).maybeSingle(),
    row.assigned_to
      ? supabaseAdmin
          .from("profiles")
          .select("full_name, email, phone")
          .eq("id", row.assigned_to)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const result = mapPropertyToImospot(row, {
    baseUrl: CRM_URL,
    images: (images ?? []) as PropertyImageRow[],
    agent: (agentResult.data ?? null) as Pick<ProfileRow, "full_name" | "email" | "phone"> | null,
    organizationPhone: org?.phone ?? null,
  });

  if (!result.ok) return { ok: false, reasons: result.reasons };
  return { ok: true, listings: result.listings, warnings: result.warnings };
}
