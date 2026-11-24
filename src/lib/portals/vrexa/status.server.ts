/** Vrexa: citirea stării de moderare (GET), notificarea respingerilor și programarea. */
import { applyVrexaRemote, parseVrexaOffers, vrexaListingState, vrexaNewRejections, vrexaOfferEnv, vrexaRejectionKey, type VrexaOffer, type VrexaPublishClient } from "./publish";
import type { VrexaEnv } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const VREXA_READ_THROTTLE_MS = 60_000;
export const VREXA_CRON_MAX_READS = 30;
export const VREXA_ACTIVE_RECHECK_MS = 24 * 60 * 60_000;
const lastRead = new Map<string, number>();
export function resetVrexaReadThrottle() { lastRead.clear(); }

type Row = { id: string; organization_id: string; property_id: string; status: string; portal_offers: unknown };

export type VrexaStatusDeps = {
  admin: Admin;
  clientFor: (organizationId: string) => Promise<{ client: VrexaPublishClient; env: VrexaEnv } | null>;
  now?: () => number;
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Notificare în clopoțel pentru agentul responsabil, o singură dată per respingere. */
export async function notifyVrexaRejection(admin: Admin, organizationId: string, propertyId: string, o: VrexaOffer): Promise<void> {
  const { data: p } = await admin.from("properties").select("title, assigned_to").eq("id", propertyId).eq("organization_id", organizationId).maybeSingle();
  if (!p?.assigned_to) return;
  const x = await sha256(JSON.stringify(["habitoo-vrexa-rejection", vrexaRejectionKey(o), p.assigned_to]));
  const id = `${x.slice(0, 8)}-${x.slice(8, 12)}-5${x.slice(13, 16)}-${((parseInt(x[16]!, 16) & 0x3) | 0x8).toString(16)}${x.slice(17, 20)}-${x.slice(20, 32)}`;
  await admin.from("notifications").upsert({
    id, organization_id: organizationId, user_id: p.assigned_to, type: "portal_failure",
    title: `Vrexa a respins anunțul: „${p.title}”`, body: o.rejection_reason ?? "Anunțul a fost respins de Vrexa.",
    link: `/app/properties/${propertyId}?tab=publishing`,
  }, { onConflict: "id", ignoreDuplicates: true });
}

/** Notifică respingerile noi și marchează ofertele ca notificate (modifică lista). */
export async function handleVrexaRejections(admin: Admin, organizationId: string, propertyId: string, offers: VrexaOffer[]): Promise<number> {
  let n = 0;
  for (const o of vrexaNewRejections(offers)) {
    await notifyVrexaRejection(admin, organizationId, propertyId, o);
    o.rejection_notified = vrexaRejectionKey(o);
    n++;
  }
  return n;
}

async function refreshRow(deps: VrexaStatusDeps, row: Row, client: VrexaPublishClient, env: VrexaEnv, onlyIds?: Set<string>): Promise<number> {
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  const offers = parseVrexaOffers(row.portal_offers);
  let reads = 0;
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i]!;
    if (vrexaOfferEnv(o) !== env || o.status === "deleted") continue;
    if (onlyIds && !onlyIds.has(o.external_id)) continue;
    const r = await client.get(o.external_id);
    reads++;
    if (r.ok) offers[i] = applyVrexaRemote(o, r.data ?? {}, nowIso);
    else if (r.status === 404) offers[i] = { ...o, status: "deleted", url: "", checked_at: nowIso };
    else offers[i] = { ...o, checked_at: nowIso };
  }
  await handleVrexaRejections(deps.admin, row.organization_id, row.property_id, offers);
  const mine = offers.filter((o) => vrexaOfferEnv(o) === env);
  const st = vrexaListingState(mine);
  const warning = mine.map((o) => o.image_warning).filter(Boolean).join(" · ") || null;
  await deps.admin.from("portal_listings").update({
    portal_offers: offers, status: row.status === "withdrawn" && st.status === "withdrawn" ? "withdrawn" : st.status,
    last_error: st.message, last_warning: st.status === "error" ? null : warning, public_url: st.publicUrl, last_sync_at: nowIso,
  }).eq("id", row.id);
  return reads;
}

/** La deschiderea tabului Promovare: cel mult o citire pe minut per anunț. */
export async function refreshVrexaOnOpen(deps: VrexaStatusDeps, organizationId: string, propertyId: string): Promise<{ refreshed: boolean }> {
  const key = `${organizationId}|${propertyId}`;
  const now = (deps.now ?? Date.now)();
  if ((lastRead.get(key) ?? 0) + VREXA_READ_THROTTLE_MS > now) return { refreshed: false };
  const { data } = await deps.admin.from("portal_listings").select("id, organization_id, property_id, status, portal_offers")
    .eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "vrexa").maybeSingle();
  if (!data) return { refreshed: false };
  const c = await deps.clientFor(organizationId);
  if (!c) return { refreshed: false };
  lastRead.set(key, now);
  await refreshRow(deps, data as Row, c.client, c.env);
  return { refreshed: true };
}

/** Ofertele care trebuie citite: în verificare (oricând) sau active necitite de 24h; cele mai vechi întâi. */
export function vrexaDueOffers(rows: Row[], env: VrexaEnv, nowMs: number, max = VREXA_CRON_MAX_READS): Array<{ row: Row; externalId: string }> {
  const due: Array<{ row: Row; externalId: string; at: number }> = [];
  for (const row of rows) for (const o of parseVrexaOffers(row.portal_offers)) {
    if (vrexaOfferEnv(o) !== env) continue;
    const at = o.checked_at ? Date.parse(o.checked_at) : 0;
    if (o.status === "processing" || o.status === "pending" || (o.status === "active" && nowMs - at >= VREXA_ACTIVE_RECHECK_MS)) due.push({ row, externalId: o.external_id, at });
  }
  return due.sort((a, b) => a.at - b.at).slice(0, max).map(({ row, externalId }) => ({ row, externalId }));
}

/** Programarea (10 min): nimic de făcut fără oferte în verificare sau active vechi. */
export async function pollVrexaStatuses(deps: VrexaStatusDeps): Promise<{ reads: number; due: number }> {
  const { data } = await deps.admin.from("portal_listings").select("id, organization_id, property_id, status, portal_offers").eq("portal", "vrexa").neq("status", "withdrawn");
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { reads: 0, due: 0 };
  const byOrg = new Map<string, Row[]>();
  for (const r of rows) byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) ?? []), r]);
  let reads = 0, dueTotal = 0;
  const nowMs = (deps.now ?? Date.now)();
  for (const [org, list] of byOrg) {
    if (reads >= VREXA_CRON_MAX_READS) break;
    const c = await deps.clientFor(org);
    if (!c) continue;
    const due = vrexaDueOffers(list, c.env, nowMs, VREXA_CRON_MAX_READS - reads);
    dueTotal += due.length;
    const byRow = new Map<string, { row: Row; ids: Set<string> }>();
    for (const d of due) { const e = byRow.get(d.row.id) ?? { row: d.row, ids: new Set<string>() }; e.ids.add(d.externalId); byRow.set(d.row.id, e); }
    for (const { row, ids } of byRow.values()) reads += await refreshRow(deps, row, c.client, c.env, ids);
  }
  return { reads, due: dueTotal };
}

/** Dependențele reale: conexiunea Vrexa a agenției, decriptată doar pe server. */
export async function vrexaStatusDeps(): Promise<VrexaStatusDeps> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  return {
    admin,
    async clientFor(organizationId) {
      const { data } = await admin.from("portal_connections").select("external_account_id, portal_credentials_encrypted, settings, activated")
        .eq("organization_id", organizationId).eq("portal", "vrexa").maybeSingle();
      const row = data as { external_account_id: string | null; portal_credentials_encrypted: string | null; settings: Record<string, unknown> | null; activated: boolean | null } | null;
      if (!row?.portal_credentials_encrypted || !row.external_account_id || row.activated !== true) return null;
      const { decryptPortalCredential } = await import("../crypto.server");
      const { vrexaClientFromParts } = await import("../adapters/vrexa.server");
      return vrexaClientFromParts({ organizationId, clientId: row.external_account_id, clientSecret: decryptPortalCredential(row.portal_credentials_encrypted) ?? "", settings: row.settings ?? {} }, process.env);
    },
  };
}
