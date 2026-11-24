/**
 * Promovări HomeZZ pe anunț: citire (`my-ads` + `check-promotions`, cel mult o
 * dată pe minut per anunț), `promote` și oprire (`replace-ad-promotion` cu
 * `new_internal_id=0`). Acțiunile cer confirmare, nu se reîncearcă niciodată
 * automat; la timeout/rețea se citește `my-ads`. Jurnal fără token/cheie.
 * Promovările nu modifică publicarea. Dependențe injectabile.
 */
import type { HomezzParams, HomezzResult } from "./client";
import { parseHomezzOffers } from "./publish";
import {
  HOMEZZ_PROMO_TTL_MS, HOMEZZ_PROMOTION_IDS, HOMEZZ_PROMOTION_UNKNOWN, homezzPromotionButtons, homezzPromotionLabel,
  parseHomezzCheckPromotions, parseHomezzMyAds, type HomezzActivePromotion, type HomezzAvailable,
} from "./promotions";

export type HomezzPromoDeps = {
  post: (action: string, params: HomezzParams) => Promise<HomezzResult>;
  agencyKey: (organizationId: string) => Promise<string>;
  /** Token-ul agentului cu acest email (reînnoit o dată la eroare de token). */
  withToken: (organizationId: string, email: string, run: (token: string) => Promise<HomezzResult>) => Promise<HomezzResult>;
  loadListing: (organizationId: string, propertyId: string) => Promise<{ id: string; status: string; portal_offers: unknown } | null>;
  saveOffers: (listingId: string, offers: unknown[]) => Promise<void>;
  log: (e: { organizationId: string; propertyId: string; operation: "promote" | "promote_stop"; success: boolean; message: string | null; httpStatus: number | null; externalId: string; response: unknown }) => Promise<void>;
  now: () => Date;
};

export type HomezzPromoOffer = {
  internalId: string; transaction: string | null; active: HomezzActivePromotion; available: HomezzAvailable;
  buttons: ReturnType<typeof homezzPromotionButtons>;
};
type Cached = { active: HomezzActivePromotion; available: HomezzAvailable };

const errText = (r: Extract<HomezzResult, { ok: false }>) => (r.adError ? `${r.message} ${r.adError}` : r.message);

async function readOffer(deps: HomezzPromoDeps, org: string, internalId: string, email: string): Promise<Cached | null> {
  const [ad, promos] = await Promise.all([
    deps.withToken(org, email, (token) => deps.post("my-ads", { token, internal_id: internalId })),
    deps.withToken(org, email, (token) => deps.post("check-promotions", { token })),
  ]);
  if (!ad.ok || !promos.ok) return null;
  return { active: parseHomezzMyAds(ad.data, internalId).active, available: parseHomezzCheckPromotions(promos.data) };
}

async function activeOffers(deps: HomezzPromoDeps, org: string, propertyId: string) {
  const listing = await deps.loadListing(org, propertyId);
  if (!listing || listing.status !== "published") return null;
  const raw = Array.isArray(listing.portal_offers) ? (listing.portal_offers as Record<string, unknown>[]).map((o) => ({ ...o })) : [];
  const offers = parseHomezzOffers(raw).filter((o) => !o.deleted && o.agent_email);
  return { listing, raw, offers };
}
const rawOf = (raw: Record<string, unknown>[], id: string) => raw.find((r) => String(r["internal_id"] ?? r["reference"] ?? "") === id);

/** Starea pentru card; `null` = anunț nepublicat. Cache pe ofertă, cel mult o citire pe minut. */
export async function loadHomezzPromotions(deps: HomezzPromoDeps, org: string, propertyId: string, opts: { force?: boolean } = {}): Promise<HomezzPromoOffer[] | null> {
  const ctx = await activeOffers(deps, org, propertyId);
  if (!ctx) return null;
  const now = deps.now();
  let changed = false;
  const out: HomezzPromoOffer[] = [];
  for (const o of ctx.offers) {
    const stored = rawOf(ctx.raw, o.internal_id)!;
    let state = (stored["promo_state"] as Cached | null | undefined) ?? null;
    const at = stored["promo_checked_at"] as string | undefined;
    if (opts.force || !at || now.getTime() - Date.parse(at) >= HOMEZZ_PROMO_TTL_MS) {
      stored["promo_checked_at"] = now.toISOString();
      state = await readOffer(deps, org, o.internal_id, o.agent_email!).catch(() => null);
      stored["promo_state"] = state;
      changed = true;
    }
    if (!state) continue;
    out.push({ internalId: o.internal_id, transaction: o.transaction ?? null, active: state.active, available: state.available, buttons: homezzPromotionButtons(state.available) });
  }
  if (changed) await deps.saveOffers(ctx.listing.id, ctx.raw).catch(() => undefined);
  return out;
}

export type HomezzPromoActionResult = { ok: boolean; message: string; active: HomezzActivePromotion | undefined };

async function afterUncertain(deps: HomezzPromoDeps, org: string, internalId: string, email: string): Promise<HomezzActivePromotion | undefined> {
  const r = await deps.withToken(org, email, (token) => deps.post("my-ads", { token, internal_id: internalId })).catch(() => null);
  return r?.ok ? parseHomezzMyAds(r.data, internalId).active : undefined;
}

async function finish(deps: HomezzPromoDeps, base: { org: string; propertyId: string; internalId: string; email: string; operation: "promote" | "promote_stop"; action: string }, r: HomezzResult, okMessage: string): Promise<HomezzPromoActionResult> {
  await deps.log({
    organizationId: base.org, propertyId: base.propertyId, operation: base.operation, success: r.ok,
    message: r.ok ? null : errText(r), httpStatus: r.status, externalId: base.internalId, response: { action: base.action, body: r.raw },
  }).catch(() => undefined);
  if (r.ok) {
    await loadHomezzPromotions(deps, base.org, base.propertyId, { force: true }).catch(() => null);
    return { ok: true, message: okMessage, active: undefined };
  }
  if (r.kind === "timeout" || r.kind === "network_error") {
    const active = await afterUncertain(deps, base.org, base.internalId, base.email);
    await loadHomezzPromotions(deps, base.org, base.propertyId, { force: true }).catch(() => null);
    if (active === undefined) return { ok: false, message: HOMEZZ_PROMOTION_UNKNOWN, active: undefined };
    return { ok: false, message: active ? `HomeZZ nu a răspuns la timp. Starea reală: ${active.label} activă.` : "HomeZZ nu a răspuns la timp. Starea reală: fără promovare activă.", active };
  }
  return { ok: false, message: errText(r), active: undefined };
}

async function target(deps: HomezzPromoDeps, org: string, propertyId: string, internalId: string) {
  const ctx = await activeOffers(deps, org, propertyId);
  const o = ctx?.offers.find((x) => x.internal_id === internalId);
  if (!o) throw new Error("Anunțul nu este publicat pe HomeZZ.");
  return o;
}

export async function promoteHomezzAd(deps: HomezzPromoDeps, input: { organizationId: string; propertyId: string; internalId: string; promotionId: number; confirmed: boolean }): Promise<HomezzPromoActionResult> {
  if (input.confirmed !== true) throw new Error("Confirmă folosirea promovării.");
  if (!HOMEZZ_PROMOTION_IDS.includes(input.promotionId)) throw new Error("Tip de promovare necunoscut.");
  const o = await target(deps, input.organizationId, input.propertyId, input.internalId);
  // O singură trimitere: `promote` nu este idempotent, fără reîncercare automată.
  const r = await deps.withToken(input.organizationId, o.agent_email!, (token) => deps.post("promote", { token, internal_id: input.internalId, promotion_id: input.promotionId }));
  return finish(deps, { org: input.organizationId, propertyId: input.propertyId, internalId: input.internalId, email: o.agent_email!, operation: "promote", action: "promote" }, r,
    `${homezzPromotionLabel(input.promotionId)} a fost aplicată pe HomeZZ.`);
}

export async function stopHomezzPromotion(deps: HomezzPromoDeps, input: { organizationId: string; propertyId: string; internalId: string; promotionId: number; confirmed: boolean }): Promise<HomezzPromoActionResult> {
  if (input.confirmed !== true) throw new Error("Confirmă oprirea promovării.");
  const o = await target(deps, input.organizationId, input.propertyId, input.internalId);
  const key = await deps.agencyKey(input.organizationId);
  const r = await deps.post("replace-ad-promotion", { key, old_internal_id: input.internalId, new_internal_id: 0, promotion_id: input.promotionId });
  return finish(deps, { org: input.organizationId, propertyId: input.propertyId, internalId: input.internalId, email: o.agent_email!, operation: "promote_stop", action: "replace-ad-promotion" }, r,
    "Promovarea a fost oprită pe HomeZZ.");
}

export async function homezzPromoDeps(): Promise<HomezzPromoDeps> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const a = await import("./agents.server");
  const agents = await a.homezzAgentDeps();
  return {
    now: () => new Date(),
    post: agents.post,
    agencyKey: agents.agencyKey,
    withToken: (org, email, run) => a.withHomezzEmailToken(org, email, agents, run),
    async loadListing(org, propertyId) {
      const { data } = await db.from("portal_listings").select("id, status, portal_offers").eq("organization_id", org).eq("property_id", propertyId).eq("portal", "homezz").maybeSingle();
      return (data as never) ?? null;
    },
    async saveOffers(id, offers) { await db.from("portal_listings").update({ portal_offers: offers as never } as never).eq("id", id); },
    async log(e) {
      await db.from("portal_operation_logs").insert({
        organization_id: e.organizationId, property_id: e.propertyId, portal: "homezz", operation: e.operation, success: e.success,
        error_message: e.message, http_status: e.httpStatus, external_id: e.externalId, portal_response: e.response as never,
      } as never);
    },
  };
}
