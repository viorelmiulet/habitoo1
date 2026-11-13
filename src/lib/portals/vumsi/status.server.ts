/**
 * Vumsi (server-only): verificarea statusului real (`GET /listings/{uuid}/`) și
 * sincronizarea în `portal_listings`. Doar citiri la Vumsi; nicio publicare/retragere.
 */
import { hasVumsiKey } from "./config";
import { vumsiRequest } from "./client.server";
import { readListing, vumsiStatusShape } from "./publish";
import { aggregateVumsiStatus, checkVumsiStatuses, vumsiShouldLogFailure, VUMSI_GONE_MESSAGE, type VumsiCheckFailure, vumsiCardView, vumsiListingPatch, vumsiOnOpenDue, vumsiScheduledDue, type VumsiStatusRow } from "./status";

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

/** 404 → `last_error`; alte 4xx → un rând `status_check` pe zi pe anunț. */
async function handleFailures(db: any, failures: VumsiCheckFailure<Row>[]) {
  const now = Date.now();
  for (const f of failures) {
    const r = f.row;
    if (f.gone) {
      await db.from("portal_listings").update({ last_error: VUMSI_GONE_MESSAGE, last_sync_at: new Date(now).toISOString() })
        .eq("organization_id", r.organization_id).eq("property_id", r.property_id).eq("portal", "vumsi");
      continue;
    }
    if (f.httpStatus === null || f.httpStatus < 400 || f.httpStatus >= 500) continue;
    const { data: last } = await db.from("portal_operation_logs").select("created_at")
      .eq("organization_id", r.organization_id).eq("portal", "vumsi").eq("operation", "status_check")
      .eq("external_id", r.external_id).eq("success", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!vumsiShouldLogFailure(f, last?.created_at ?? null, now)) continue;
    await db.from("portal_operation_logs").insert({
      organization_id: r.organization_id, property_id: r.property_id, portal: "vumsi", operation: "status_check",
      success: false, http_status: f.httpStatus, error_code: f.kind, external_id: r.external_id,
      error_message: `Verificarea statusului Vumsi a eșuat (HTTP ${f.httpStatus}, ${f.kind}).`,
    });
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
    const failures: VumsiCheckFailure<Row>[] = [];
    const changed = await checkVumsiStatuses(call, readListing, rows, (r) => vumsiOnOpenDue(r, now), now, vumsiStatusShape, failures);
    if (changed.length) {
      await saveChecked(db, changed);
      await syncPortalListing(db, organizationId, propertyId, rows);
      await handleFailures(db, failures);
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
  const failures: VumsiCheckFailure<Row>[] = [];
  const changed = await checkVumsiStatuses(call, readListing, due, () => true, now, vumsiStatusShape, failures);
  if (changed.length) await saveChecked(db, changed);
  const props = new Set(changed.map((r) => `${r.organization_id}:${r.property_id}`));
  for (const key of props) {
    const [o, p] = key.split(":") as [string, string];
    await syncPortalListing(db, o, p, all.filter((r) => r.organization_id === o && r.property_id === p)).catch(() => undefined);
  }
  await handleFailures(db, failures).catch(() => undefined);
  return { checked: changed.length, published: changed.filter((r) => r.status === 2).length };
}
