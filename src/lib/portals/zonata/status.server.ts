/**
 * ZonaTa: verificarea statusului (GET /listings/ext:{id}), cel mult o dată pe minut
 * pe anunț. Actualizează `zonata_listings` și starea agregată din `portal_listings`.
 */
import { getZonataListing, readZonataListing, zonataStatusCheckDue, aggregateZonataStatus, zonataStatusMessage, ZONATA_PORTAL_STATUS, type ZonataStatus } from "./publish";
import { loadZonataStored, saveZonataStates, type ZonataStoredListing } from "./load.server";
import { normalizeZonataKey, isValidZonataKey, zonataKeyMode } from "./key";

const CHECKABLE = new Set<ZonataStatus>(["in_review", "active", "rejected"]);

export async function refreshZonataStatus(input: { organizationId: string; propertyId: string }, opts: { onlyInReview?: boolean } = {}): Promise<ZonataStoredListing[]> {
  const stored = await loadZonataStored(input);
  const now = Date.now();
  const due = stored.filter((r) => (opts.onlyInReview ? r.status === "in_review" : CHECKABLE.has(r.status)) && zonataStatusCheckDue(r.last_checked_at, now));
  if (due.length === 0) return stored;
  const { buildContext } = await import("@/lib/portals.functions");
  const { getPortalDefinition } = await import("@/lib/portals/registry");
  const { ctx } = await buildContext(input.organizationId, getPortalDefinition("zonata")!);
  const key = normalizeZonataKey(ctx.portalCredential);
  if (!key || !isValidZonataKey(key) || zonataKeyMode(key) === "test" || !ctx.allowLiveRequests) return stored;

  const updates: Parameters<typeof saveZonataStates>[1] = [];
  for (const row of due) {
    const res = await getZonataListing(key, row.external_id);
    if (!res.ok) {
      if (res.kind === "not_found") {
        updates.push({ transaction: row.transaction, state: { externalId: row.external_id, zonataId: null, status: "withdrawn", url: null, expiresAt: null, rejectedReason: null } });
      }
      continue;
    }
    const st = readZonataListing(res.data);
    if (!st.status) continue;
    updates.push({ transaction: row.transaction, state: { ...st, externalId: row.external_id, status: st.status } });
  }
  await saveZonataStates(input, updates, true);
  const fresh = await loadZonataStored(input);
  if (updates.length) await syncPortalListing(input, fresh);
  return fresh;
}

async function syncPortalListing(input: { organizationId: string; propertyId: string }, rows: ZonataStoredListing[]) {
  const live = rows.filter((r) => r.status !== "test");
  const agg = aggregateZonataStatus(live.map((r) => r.status));
  if (!agg) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rejected = live.find((r) => r.status === "rejected");
  const url = live.find((r) => r.status === "active" && r.url)?.url;
  await (supabaseAdmin as any).from("portal_listings").update({
    status: ZONATA_PORTAL_STATUS[agg],
    last_sync_at: new Date().toISOString(),
    last_error: rejected
      ? zonataStatusMessage({ externalId: rejected.external_id, zonataId: null, status: "rejected", url: null, expiresAt: null, rejectedReason: rejected.rejected_reason })
      : null,
    ...(url ? { public_url: url } : {}),
  }).eq("organization_id", input.organizationId).eq("portal", "zonata").eq("property_id", input.propertyId)
    // O retragere cerută de agent nu se suprascrie din status.
    .neq("status", "withdrawn");
}

/** Cron: anunțurile „În verificare”, cel mult 50 pe rulare. */
export async function pollZonataInReview(): Promise<{ checked: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("zonata_listings")
    .select("organization_id, property_id").eq("status", "in_review").limit(200);
  const pairs = [...new Map(((data ?? []) as { organization_id: string; property_id: string }[])
    .map((r) => [`${r.organization_id}:${r.property_id}`, r])).values()].slice(0, 50);
  for (const p of pairs) {
    await refreshZonataStatus({ organizationId: p.organization_id, propertyId: p.property_id }, { onlyInReview: true }).catch(() => undefined);
  }
  return { checked: pairs.length };
}
