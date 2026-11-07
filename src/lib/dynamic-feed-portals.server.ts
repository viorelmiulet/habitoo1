import { createHash, randomBytes } from "node:crypto";
import { STATIC_PORTALS, PROMOTION_CATALOGS } from "./portals/registry";
import { chooseFeedPrefix, dynamicFeedPortalSchema, dynamicPortalDefinition, type DynamicFeedPortal } from "./dynamic-feed-portals";
import { INDEX_PORTALS } from "./portals/clickimob/index-feed";
import { readCompleteRows } from "./site-feed/complete-read.server";

export async function loadDynamicFeedPortals(): Promise<DynamicFeedPortal[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return readCompleteRows((from, to) => supabaseAdmin.from("dynamic_feed_portals")
    .select("slug,display_name,key_prefix,website,logo_path,xml_enabled,active,show_public").order("slug").range(from, to));
}
export async function resolveIndexPortal(slug: string) {
  const fixed = INDEX_PORTALS[slug as keyof typeof INDEX_PORTALS];
  if (fixed) return { ...fixed, active: true };
  if ([...STATIC_PORTALS, ...PROMOTION_CATALOGS].some(p => p.id === slug)) return null;
  const row = (await loadDynamicFeedPortals()).find(p => p.slug === slug);
  return row ? { prefix: row.key_prefix, secret: null, version: `habitoo-${slug}-index/1.0`, active: row.active,
    ...(row.xml_enabled ? { xmlPath: `/api/public/portal/v1/${slug}/feed.xml` } : {}) } : null;
}
export async function findDynamicIndexTokenPortal(token: string): Promise<string | null> {
  // Prefix is only dispatch: authenticateFeedRequest verifies the full HMAC and current agency presence afterwards.
  if (!/^hb[a-z]{2}_[A-Za-z0-9]+\.[a-f0-9]{64}$/.test(token)) return null;
  const row = (await loadDynamicFeedPortals()).find(p => token.startsWith(p.key_prefix));
  return row?.slug ?? null;
}
type Caller = { rpc: (name: "create_dynamic_feed_portal", args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function createDynamicFeedPortalCore(caller: Caller, raw: unknown) {
  const input = dynamicFeedPortalSchema.parse(raw);
  const reserved = [...STATIC_PORTALS, ...PROMOTION_CATALOGS].map(p => p.id);
  if (reserved.includes(input.slug)) throw new Error("Identificatorul există deja în registry.");
  if (input.logo_path && !input.logo_path.startsWith(`${input.slug}/`)) throw new Error("Logo invalid.");
  const current = await loadDynamicFeedPortals();
  if (current.some(p => p.slug === input.slug)) throw new Error("Identificatorul există deja.");
  const reservedPrefixes = [...Object.values(INDEX_PORTALS).map(p => p.prefix), "hbps_"];
  const used = [...reservedPrefixes, ...current.map(p => p.key_prefix)];
  const suggested = chooseFeedPrefix(input.slug, used);
  const suffix = randomBytes(32).toString("hex");
  const prefixes = [suggested, ...Array.from({ length: 676 }, (_, n) => `hb${String.fromCharCode(97 + Math.floor(n / 26), 97 + n % 26)}_`).filter(p => p !== suggested)];
  // The final key hash must include the actual chosen prefix, so allocate and insert inside a single RPC using a hash per candidate.
  const { data, error } = await caller.rpc("create_dynamic_feed_portal", {
    _slug: input.slug, _name: input.display_name, _website: input.website, _xml: input.xml_enabled,
    _public: input.show_public, _logo: input.logo_path, _prefixes: prefixes, _reserved: reserved,
    _reserved_prefixes: reservedPrefixes, _key_hash: JSON.stringify(Object.fromEntries(prefixes.map(p => [p, createHash("sha256").update(p + suffix).digest("hex")]))), _last4: suffix.slice(-4),
  });
  if (error || typeof data !== "string") throw new Error(error?.message?.includes("Identificator") ? "Identificatorul există deja." : "Portalul nu a putut fi salvat.");
  return { key: data + suffix };
}
export async function dynamicRegistryDefinitions() {
  return (await loadDynamicFeedPortals()).map(dynamicPortalDefinition);
}