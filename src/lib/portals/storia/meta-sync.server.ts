/**
 * Joburile de sincronizare a stării Storia din `/meta` (doar GET):
 *  - la 5 minute: anunțurile `pending` din ultimele 48 de ore, `GET /advert/v1/{uuid}/meta`;
 *  - la 6 ore: pentru fiecare agenție conectată, `GET /advert/v1/meta` paginat.
 * Starea se aplică prin `processLifecycle`, exact ca o notificare.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { olxAuthorizedRequest, loadStoriaTokens } from "./oauth.server";
import { storiaListingStatus, parseAdvertRefs } from "./adverts.server";
import { processLifecycle, readEventShape } from "./leads.server";
import {
  STORIA_META_MIN_GAP_MS,
  STORIA_META_PENDING_WINDOW_MS,
  fetchAllStoriaMeta,
  metaSyncDecision,
  metaToNotification,
  parseStoriaMetaRecord,
  type StoriaMetaRecord,
} from "./meta-sync";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type MetaApplyResult = { uuid: string; propertyId: string | null; status: string | null; note: string };

/** Aplică un rând `/meta` pe anunțul din Habitoo (dacă există). */
export async function applyStoriaMeta(
  organizationId: string,
  meta: StoriaMetaRecord,
): Promise<MetaApplyResult> {
  const { data: rows } = await supabaseAdmin
    .from("portal_listings")
    .select("property_id, status, last_event_at, public_url, external_id")
    .eq("portal", "storia")
    .eq("organization_id", organizationId)
    .ilike("external_id", `%${meta.uuid}%`)
    .limit(1);
  const row = rows?.[0];
  if (!row) return { uuid: meta.uuid, propertyId: null, status: null, note: "anunț inexistent în Habitoo — ignorat" };
  const mapped = storiaListingStatus(meta.code);
  if (metaSyncDecision(meta, { status: row.status, lastEventAt: row.last_event_at, publicUrl: row.public_url }, mapped) === "skip") {
    return { uuid: meta.uuid, propertyId: row.property_id, status: row.status, note: "fără schimbare / notificare mai nouă — neatins" };
  }
  const shape = readEventShape(metaToNotification(meta));
  if (!shape) return { uuid: meta.uuid, propertyId: row.property_id, status: row.status, note: "meta ilizibil" };
  const result = await processLifecycle(supabaseAdmin, shape);
  if (meta.lastError && mapped !== "published") {
    await supabaseAdmin
      .from("portal_listings")
      .update({ last_error: `Storia: ${meta.lastError}`.slice(0, 500) })
      .eq("portal", "storia")
      .eq("organization_id", organizationId)
      .eq("property_id", row.property_id);
  }
  return { uuid: meta.uuid, propertyId: row.property_id, status: mapped, note: result.note ?? "" };
}

function uuidsOf(externalId: string | null): string[] {
  const refs = parseAdvertRefs(externalId) as unknown as Record<string, string | null | undefined>;
  return Object.values(refs).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
}

/** Job la 5 minute: anunțurile în așteptare de cel mult 48 de ore. */
export async function syncPendingStoriaListings(filter?: { advertUuid?: string }) {
  const since = new Date(Date.now() - STORIA_META_PENDING_WINDOW_MS).toISOString();
  let q = supabaseAdmin
    .from("portal_listings")
    .select("organization_id, external_id")
    .eq("portal", "storia")
    .eq("status", "pending")
    .gte("updated_at", since)
    .limit(500);
  if (filter?.advertUuid) q = q.ilike("external_id", `%${filter.advertUuid}%`);
  const { data } = await q;
  const byOrg = new Map<string, string[]>();
  for (const r of data ?? []) {
    const list = byOrg.get(r.organization_id) ?? [];
    for (const u of uuidsOf(r.external_id)) {
      if (!filter?.advertUuid || u.toLowerCase() === filter.advertUuid.toLowerCase()) list.push(u);
    }
    byOrg.set(r.organization_id, list);
  }
  const results: MetaApplyResult[] = [];
  // Agențiile rulează în paralel; în interiorul fiecăreia, max 2 cereri/s.
  await Promise.all(
    [...byOrg].map(async ([orgId, uuids]) => {
      for (let i = 0; i < uuids.length; i++) {
        if (i > 0) await sleep(STORIA_META_MIN_GAP_MS);
        try {
          const res = await olxAuthorizedRequest(orgId, "GET", `/advert/v1/${uuids[i]}/meta`);
          const meta = res.status >= 200 && res.status < 300 ? parseStoriaMetaRecord(res.body?.["data"], uuids[i]) : null;
          if (!meta) {
            results.push({ uuid: uuids[i]!, propertyId: null, status: null, note: `meta indisponibil (HTTP ${res.status})` });
            continue;
          }
          results.push(await applyStoriaMeta(orgId, meta));
        } catch (error) {
          results.push({ uuid: uuids[i]!, propertyId: null, status: null, note: `eroare: ${String(error).slice(0, 200)}` });
        }
      }
    }),
  );
  return { checked: results.length, results };
}

/** Job la 6 ore: reconcilierea completă a fiecărei agenții conectate. */
export async function reconcileStoriaAccounts() {
  const { data: conns } = await supabaseAdmin
    .from("portal_connections")
    .select("organization_id")
    .eq("portal", "storia");
  const summary: { organizationId: string; pages: number; records: number; applied: number; complete: boolean }[] = [];
  await Promise.all(
    (conns ?? []).map(async ({ organization_id: orgId }) => {
      if (!(await loadStoriaTokens(orgId).catch(() => null))) return;
      try {
        const { records, pages, complete } = await fetchAllStoriaMeta(
          async (path) => olxAuthorizedRequest(orgId, "GET", path),
          sleep,
        );
        let applied = 0;
        for (const meta of records) {
          const r = await applyStoriaMeta(orgId, meta);
          if (r.propertyId && !r.note.startsWith("fără schimbare")) applied++;
        }
        summary.push({ organizationId: orgId, pages, records: records.length, applied, complete });
      } catch (error) {
        console.error("[storia-meta] reconcilierea a eșuat", orgId, String(error).slice(0, 200));
      }
    }),
  );
  return { organizations: summary.length, summary };
}
