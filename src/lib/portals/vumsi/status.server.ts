/**
 * Vumsi (server-only): verificarea statusului real (`GET /listings/{uuid}/`) și
 * sincronizarea în `portal_listings`. Doar citiri la Vumsi; nicio publicare/retragere.
 */
import { hasVumsiKey } from "./config";
import { vumsiRequest } from "./client.server";
import { readListing } from "./publish";
import { aggregateVumsiStatus, checkVumsiStatuses, vumsiCardView, vumsiListingPatch, vumsiOnOpenDue, vumsiScheduledDue, type VumsiStatusRow } from "./status";

type Row = VumsiStatusRow & { organization_id: string; property_id: string };
const COLS = "organization_id,property_id,external_id,vumsi_uuid,status,public_url,expires_at,status_checked_at,deleted_at";
/** Cel mult atâtea GET-uri pe rulare programată (clientul limitează și la 2/s). */
export const VUMSI_POLL_LIMIT = 30;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const call = (m: "GET", p: string) => vumsiRequest<unknown>(m, p, {});

async function enabled(db: any, organizationId: string, propertyId: string) {
  const { data } = await db.from("portal_publications").select("enabled")
    .eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal_key", "vumsi").maybeSingle();
  return data?.enabled === true;
}

async function saveChecked(db: any, rows: Row[]) {
  for (const r of rows) {
    await db.from("vumsi_listings").update({
      status: r.status, public_url: r.public_url, expires_at: r.expires_at, status_checked_at: r.status_checked_at,
    }).eq("organization_id", r.organization_id).eq("external_id", r.external_id);
  }
}

/** Actualizează `portal_listings` (doar dacă Vumsi e bifat) din toate tranzacțiile proprietății. */
async function syncPortalListing(db: any, organizationId: string, propertyId: string, rows: Row[]) {
  const agg = aggregateVumsiStatus(rows);
  if (!agg || !(await enabled(db, organizationId, propertyId))) return;
  const { data: current } = await db.from("portal_listings").select("last_error")
    .eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "vumsi").maybeSingle();
  if (!current) return;
  await db.from("portal_listings").update(vumsiListingPatch(agg, current.last_error ?? null, new Date().toISOString()))
    .eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "vumsi");
}

/** La deschiderea tabului Promovare: max 1 verificare/minut/anunț. */
export async function refreshVumsiStatus(organizationId: string, propertyId: string) {
  const db = await admin();
  const { data } = await db.from("vumsi_listings").select(COLS).eq("organization_id", organizationId).eq("property_id", propertyId);
  const rows = ((data ?? []) as Row[]).filter((r) => r.vumsi_uuid && !r.deleted_at);
  if (hasVumsiKey()) {
    const now = Date.now();
    const changed = await checkVumsiStatuses(call, readListing, rows, (r) => vumsiOnOpenDue(r, now), now);
    if (changed.length) {
      await saveChecked(db, changed);
      await syncPortalListing(db, organizationId, propertyId, rows);
    }
  }
  const agg = aggregateVumsiStatus(rows);
  return agg ? { status: agg.status, ...vumsiCardView(agg.status, agg.reason), publicUrl: agg.publicUrl, expiresAt: agg.expiresAt } : null;
}

/** Cron (la 10 minute): anunțurile bifate scadente (1/3/necunoscut la 30 min, publicate o dată pe zi). */
export async function pollVumsiStatuses(): Promise<{ checked: number; published: number }> {
  if (!hasVumsiKey()) return { checked: 0, published: 0 };
  const db = await admin();
  const { data: pubs } = await db.from("portal_publications").select("organization_id,property_id")
    .eq("portal_key", "vumsi").eq("enabled", true).limit(5000);
  const on = new Set(((pubs ?? []) as { organization_id: string; property_id: string }[]).map((p) => `${p.organization_id}:${p.property_id}`));
  if (!on.size) return { checked: 0, published: 0 };
  const { data } = await db.from("vumsi_listings").select(COLS).not("vumsi_uuid", "is", null).is("deleted_at", null)
    .order("status_checked_at", { ascending: true, nullsFirst: true }).limit(2000);
  const now = Date.now();
  const all = ((data ?? []) as Row[]).filter((r) => on.has(`${r.organization_id}:${r.property_id}`));
  const due = all.filter((r) => vumsiScheduledDue(r, now)).slice(0, VUMSI_POLL_LIMIT);
  const changed = await checkVumsiStatuses(call, readListing, due, () => true, now);
  if (changed.length) await saveChecked(db, changed);
  const props = new Set(changed.map((r) => `${r.organization_id}:${r.property_id}`));
  for (const key of props) {
    const [o, p] = key.split(":") as [string, string];
    await syncPortalListing(db, o, p, all.filter((r) => r.organization_id === o && r.property_id === p)).catch(() => undefined);
  }
  return { checked: changed.length, published: changed.filter((r) => r.status === 2).length };
}
