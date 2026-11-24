/** Statisticile HomeZZ ale anunțului (`get-stats`, de la publicare până azi), citite cel mult o dată la 10 minute per anunț. */
import type { HomezzResult } from "./client";
import { formatHomezzStats, homezzStatsDue, parseHomezzStats, type HomezzStats } from "./messages";
import { parseHomezzOffers } from "./publish";

export type HomezzStatsDeps = {
  loadListing: (organizationId: string, propertyId: string) => Promise<{ id: string; status: string; portal_offers: unknown } | null>;
  saveOffers: (listingId: string, offers: unknown[]) => Promise<void>;
  getStats: (organizationId: string, internalId: string) => Promise<HomezzResult>;
  now: () => Date;
};

/** `null` = fără linie (nepublicat sau eroare). */
export async function loadHomezzStatsLine(deps: HomezzStatsDeps, organizationId: string, propertyId: string): Promise<string | null> {
  const listing = await deps.loadListing(organizationId, propertyId);
  if (!listing || listing.status !== "published") return null;
  const now = deps.now();
  const raw = Array.isArray(listing.portal_offers) ? (listing.portal_offers as Record<string, unknown>[]).map((o) => ({ ...o })) : [];
  const offers = parseHomezzOffers(raw);
  const active = offers.filter((o) => !o.deleted);
  if (!active.length) return null;
  let changed = false;
  const total: HomezzStats = { messages: 0, phoneViews: 0, favorites: 0 };
  for (const o of active) {
    const stored = raw.find((r) => String(r["internal_id"] ?? r["reference"] ?? "") === o.internal_id)!;
    let s = (stored["stats"] as HomezzStats | null | undefined) ?? null;
    if (homezzStatsDue(stored["stats_checked_at"] as string | null | undefined, now)) {
      stored["stats_checked_at"] = now.toISOString();
      changed = true;
      const r = await deps.getStats(organizationId, o.internal_id).catch(() => null);
      s = r?.ok ? parseHomezzStats(r.data) : null;
      stored["stats"] = s;
    }
    if (!s) { if (changed) await deps.saveOffers(listing.id, raw).catch(() => undefined); return null; }
    total.messages += s.messages; total.phoneViews += s.phoneViews; total.favorites += s.favorites;
  }
  if (changed) await deps.saveOffers(listing.id, raw).catch(() => undefined);
  return formatHomezzStats(total);
}

export async function homezzStatsDeps(): Promise<HomezzStatsDeps> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { homezzAgentDeps } = await import("./agents.server");
  const agents = await homezzAgentDeps();
  return {
    now: () => new Date(),
    async loadListing(organizationId, propertyId) {
      const { data } = await db.from("portal_listings").select("id, status, portal_offers").eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "homezz").maybeSingle();
      return (data as never) ?? null;
    },
    async saveOffers(id, offers) { await db.from("portal_listings").update({ portal_offers: offers as never } as never).eq("id", id); },
    async getStats(organizationId, internalId) { return agents.post("get-stats", { key: await agents.agencyKey(organizationId), internal_id: internalId }); },
  };
}
