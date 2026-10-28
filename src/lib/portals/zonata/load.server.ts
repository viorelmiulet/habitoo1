/** ZonaTa (server-only): proprietatea → corpuri de anunț, plus starea salvată în `zonata_listings`. */
import { isPropertyFeedEligible } from "@/lib/site-feed/mapper";
import { mapPropertyToZonata, zonataExternalId, type ZonataListingBody } from "./mapper";
import type { ZonataListingState, ZonataStatus } from "./publish";

export type ZonataStoredListing = {
  external_id: string;
  transaction: "sale" | "rent";
  status: ZonataStatus;
  url: string | null;
  expires_at: string | null;
  rejected_reason: string | null;
  last_checked_at: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function buildZonataBodies(input: { organizationId: string; propertyId: string }): Promise<
  { ok: true; bodies: ZonataListingBody[]; warnings: string[] } | { ok: false; reasons: string[] }
> {
  const db = await admin();
  const { data: p } = await db.from("properties").select("*")
    .eq("id", input.propertyId).eq("organization_id", input.organizationId).maybeSingle();
  if (!p) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };
  if (!isPropertyFeedEligible(p)) return { ok: false, reasons: ["Oferta nu este publicabilă: verifică statusul și publicarea pe site."] };
  const { loadZonataImages, loadZonataNomenclature } = await import("./context.server");
  const [nomenclature, images] = await Promise.all([
    loadZonataNomenclature(db),
    loadZonataImages(db, input.organizationId, [p.id]),
  ]);
  const r = mapPropertyToZonata(p, { nomenclature, images: images.get(p.id) ?? [] });
  return r.ok ? { ok: true, bodies: r.bodies, warnings: r.warnings } : { ok: false, reasons: r.reasons };
}

export async function zonataCandidateIds(input: { organizationId: string; propertyId: string }): Promise<string[]> {
  const db = await admin();
  const { data } = await db.from("properties").select("id, reference")
    .eq("id", input.propertyId).eq("organization_id", input.organizationId).maybeSingle();
  return data ? [zonataExternalId(data, "sale"), zonataExternalId(data, "rent")] : [];
}

export async function loadZonataStored(input: { organizationId: string; propertyId: string }): Promise<ZonataStoredListing[]> {
  const db = await admin();
  const { data } = await db.from("zonata_listings")
    .select("external_id, transaction, status, url, expires_at, rejected_reason, last_checked_at")
    .eq("organization_id", input.organizationId).eq("property_id", input.propertyId);
  return (data ?? []) as ZonataStoredListing[];
}

export async function saveZonataStates(
  input: { organizationId: string; propertyId: string },
  rows: { transaction: "sale" | "rent"; state: ZonataListingState & { externalId: string; status: ZonataStatus } }[],
  checked: boolean,
): Promise<void> {
  if (rows.length === 0) return;
  const db = await admin();
  const now = new Date().toISOString();
  await db.from("zonata_listings").upsert(
    rows.map(({ transaction, state }) => ({
      organization_id: input.organizationId,
      property_id: input.propertyId,
      external_id: state.externalId,
      transaction,
      zonata_id: state.zonataId,
      status: state.status,
      url: state.url,
      expires_at: state.expiresAt,
      rejected_reason: state.rejectedReason,
      updated_at: now,
      ...(checked ? { last_checked_at: now } : {}),
    })),
    { onConflict: "organization_id,external_id" },
  );
}
