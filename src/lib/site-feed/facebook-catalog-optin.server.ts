// Opt-in per anunț în Catalogul Facebook: rând `portal_publications` cu
// portal_key = facebook_catalog. Fără rând sau enabled=false → nu intră în feed.
// Fără limită de locuri: mecanismul `portal_slot_*` nu este folosit.
import { FACEBOOK_CATALOG_PORTAL_KEY, type FacebookListingReason } from "@/lib/facebook-catalog-status";
import { buildFacebookCatalogCsv } from "@/lib/site-feed/facebook-catalog";
import { loadFacebookCatalogInput } from "@/lib/site-feed/facebook-catalog.server";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Anunțurile agenției cu opt-in activ. */
export async function optedInPropertyIds(admin: AdminClient, organizationId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("portal_publications")
      .select("property_id")
      .eq("organization_id", organizationId)
      .eq("portal_key", FACEBOOK_CATALOG_PORTAL_KEY)
      .eq("enabled", true)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.property_id);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Motivul de excludere pentru fiecare anunț (null = eligibil), cu regulile feedului. */
export async function facebookEligibility(
  admin: AdminClient,
  organizationId: string,
  propertyIds?: string[],
): Promise<Map<string, FacebookListingReason | null>> {
  const input = await loadFacebookCatalogInput(admin, organizationId, true, propertyIds, false);
  const result = buildFacebookCatalogCsv({ ...input, baseUrl: "https://crm.habitoo.ro", publicSiteUrl: "https://habitoo.ro" });
  const reasons = new Map<string, FacebookListingReason | null>();
  for (const p of input.properties) reasons.set(p.id, null);
  for (const it of result.excludedItems ?? []) reasons.set(it.id, it.reason);
  for (const id of propertyIds ?? []) if (!reasons.has(id)) reasons.set(id, "not_published");
  return reasons;
}

/** Scrie opt-in-ul (doar anunțuri ale organizației date). Returnează câte s-au schimbat. */
export async function setFacebookCatalogEnabled(
  admin: AdminClient,
  input: { organizationId: string; propertyIds: string[]; enabled: boolean; actorId: string; source: string },
): Promise<number> {
  const ids = Array.from(new Set(input.propertyIds));
  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    // Doar anunțurile care aparțin organizației (nesterse).
    const { data: own, error: ownErr } = await admin
      .from("properties")
      .select("id")
      .eq("organization_id", input.organizationId)
      .is("deleted_at", null)
      .in("id", chunk);
    if (ownErr) throw ownErr;
    const ownIds = (own ?? []).map((r) => r.id);
    if (ownIds.length === 0) continue;
    const { data: existing, error } = await admin
      .from("portal_publications")
      .select("id, property_id, enabled")
      .eq("organization_id", input.organizationId)
      .eq("portal_key", FACEBOOK_CATALOG_PORTAL_KEY)
      .in("property_id", ownIds);
    if (error) throw error;
    const byProp = new Map((existing ?? []).map((r) => [r.property_id, r]));
    const toUpdate = (existing ?? []).filter((r) => r.enabled !== input.enabled).map((r) => r.id);
    if (toUpdate.length) {
      const { error: upErr } = await admin
        .from("portal_publications")
        .update({ enabled: input.enabled, status: input.enabled ? "synced" : "disabled", updated_by: input.actorId })
        .in("id", toUpdate);
      if (upErr) throw upErr;
      changed += toUpdate.length;
    }
    if (input.enabled) {
      const missing = ownIds.filter((id) => !byProp.has(id));
      if (missing.length) {
        const { error: insErr } = await admin.from("portal_publications").insert(
          missing.map((property_id) => ({
            organization_id: input.organizationId,
            property_id,
            portal_key: FACEBOOK_CATALOG_PORTAL_KEY,
            enabled: true,
            status: "synced",
            created_by: input.actorId,
            updated_by: input.actorId,
          })),
        );
        if (insErr) throw insErr;
        changed += missing.length;
      }
    }
  }
  if (changed > 0) {
    await admin.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      action: input.enabled ? "facebook_catalog.listings_enabled" : "facebook_catalog.listings_disabled",
      entity: "portal_publications",
      new_values: { count: changed, source: input.source, property_ids: ids.length <= 20 ? ids : undefined },
    });
  }
  return changed;
}
