/** Procesarea promovărilor Storia (`vas_lifecycle` / `publish_vas`) — doar citiri către Storia. */
import { parseAdvertRefs } from "./adverts.server";
import { applyOlxExport, hasOlxLink, readVasEvent, readVasList, type StoriaVasEvent } from "./vas";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function findListing(admin: Admin, advertUuid: string, organizationId?: string) {
  let q = admin
    .from("portal_listings")
    .select("organization_id, property_id, external_id, portal_offers, status")
    .eq("portal", "storia")
    .ilike("external_id", `%${advertUuid}%`)
    .limit(5);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data } = await q;
  for (const row of data ?? []) {
    const refs = parseAdvertRefs(row.external_id);
    const tx = refs.sale?.toLowerCase() === advertUuid ? "sale" : refs.rent?.toLowerCase() === advertUuid ? "rent" : null;
    if (tx) return { row, tx: tx as "sale" | "rent" };
  }
  return null;
}

export async function applyVasEvent(
  admin: Admin,
  e: StoriaVasEvent,
  organizationId?: string,
): Promise<{ processed: true; note: string; changed: boolean }> {
  if (e.promotionCode !== "olx") {
    return { processed: true, note: `promovare Storia „${e.promotionCode ?? "-"}” — fără efect în Habitoo`, changed: false };
  }
  if (!e.advertUuid) return { processed: true, note: "promovare OLX fără advert_uuid — ignorată", changed: false };
  const found = await findListing(admin, e.advertUuid, organizationId);
  if (!found) {
    return { processed: true, note: `promovare OLX pentru un anunț inexistent în Habitoo (${e.advertUuid}) — ignorată`, changed: false };
  }
  const next = applyOlxExport(found.row.portal_offers, found.tx, e);
  await admin
    .from("portal_listings")
    .update({ portal_offers: next as never })
    .eq("portal", "storia")
    .eq("organization_id", found.row.organization_id)
    .eq("property_id", found.row.property_id);
  const shown = hasOlxLink(next, found.tx);
  return {
    processed: true,
    note: shown ? `export OLX aplicat (${found.tx}): ${e.olxUrl}` : `export OLX „${e.status ?? "-"}” (${found.tx}) — link ascuns`,
    changed: shown,
  };
}

export async function processStoriaVas(admin: Admin, parsed: unknown) {
  return applyVasEvent(admin, readVasEvent(parsed));
}

/** Recuperare: completează linkul OLX lipsă pentru anunțurile Storia publicate ale agenției. */
export async function recoverOlxLinks(
  admin: Admin,
  organizationId: string,
  request: (path: string) => Promise<{ status: number; body: Record<string, unknown> | null }>,
  sleep: (ms: number) => Promise<void>,
): Promise<{ checked: number; found: number; skipped?: string }> {
  const { data } = await admin
    .from("portal_listings")
    .select("external_id, portal_offers")
    .eq("portal", "storia")
    .eq("organization_id", organizationId)
    .in("status", ["published", "updated"])
    .limit(500);
  let checked = 0;
  let found = 0;
  for (const row of data ?? []) {
    const refs = parseAdvertRefs(row.external_id);
    for (const tx of ["sale", "rent"] as const) {
      const uuid = refs[tx]?.toLowerCase();
      if (!uuid || hasOlxLink(row.portal_offers, tx)) continue;
      if (checked > 0) await sleep(500);
      checked++;
      const res = await request(`/vas/v1/advert/${uuid}`);
      if (res.status === 403) return { checked, found, skipped: "fără dreptul read:vas" };
      if (res.status < 200 || res.status >= 300) continue;
      for (const e of readVasList(res.body, uuid)) {
        if (e.promotionCode !== "olx" || e.status !== "applied") continue;
        const r = await applyVasEvent(admin, { ...e, advertUuid: uuid }, organizationId);
        if (r.changed) found++;
        break;
      }
    }
  }
  return { checked, found };
}
