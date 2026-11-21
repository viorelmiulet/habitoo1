import { changedRevisions, type ContentRevision } from "./indexnow";

/** The IndexNow key is public by protocol; only counts and statuses are logged. */
type Deps = { key?: string; db?: any; send?: typeof fetch };
export async function notifyIndexNow(current: ContentRevision[], deps: Deps = {}): Promise<void> {
  const key = deps.key ?? process.env["INDEXNOW_KEY"];
  if (!key) return;
  const supabaseAdmin = deps.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("seo_indexnow_claim");
  if (claimError) console.warn("[indexnow] lock claim failed");
  if (claimError || !claimed) return;
  try {
    const { data, error } = await supabaseAdmin.from("seo_indexnow_receipts").select("url,revision").in("url", current.map(item => item.url));
    if (error) { console.warn("[indexnow] receipts read failed"); return; }
    const changed = changedRevisions(current, data ?? []);
    if (!changed.length) return;
    const response = await (deps.send ?? fetch)("https://api.indexnow.org/indexnow", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ host: "www.habitoo.ro", key, keyLocation: `https://www.habitoo.ro/${key}.txt`, urlList: changed.map(item => item.url) }),
    });
    console.info(`[indexnow] sent ${changed.length} URL(s), status ${response.status}`);
    if (response.status === 200 || response.status === 202) await supabaseAdmin.from("seo_indexnow_receipts").upsert(changed.map((item: ContentRevision) => ({ ...item, sent_at: new Date().toISOString() })));
  } catch {
    console.warn("[indexnow] notification failed");
  } finally {
    await supabaseAdmin.from("seo_indexnow_lock").update({ held_until: new Date().toISOString() }).eq("id", true);
  }
}
export const OFFER_INDEXNOW_BATCH = 1000;
/** Drains queued offer URLs in batches; failures keep rows queued for the next run and never touch publishing. */
export async function flushOfferIndexNow(deps: Deps = {}): Promise<{ sent: number; status: number | null }> {
  const key = deps.key ?? process.env["INDEXNOW_KEY"];
  if (!key) return { sent: 0, status: null };
  const db = deps.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data: claimed, error: claimError } = await db.rpc("seo_indexnow_claim");
  if (claimError || !claimed) return { sent: 0, status: null };
  let sent = 0; let status: number | null = null;
  try {
    for (let round = 0; round < 10; round++) {
      const { data, error } = await db.from("seo_indexnow_offer_queue").select("url,enqueued_at").order("enqueued_at").limit(OFFER_INDEXNOW_BATCH);
      if (error) { console.warn("[indexnow] offer queue read failed"); break; }
      const rows = (data ?? []) as { url: string; enqueued_at: string }[];
      const urls = rows.map(r => r.url).filter(u => u.startsWith("https://www.habitoo.ro/oferta/"));
      if (!urls.length) break;
      const response = await (deps.send ?? fetch)("https://api.indexnow.org/indexnow", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ host: "www.habitoo.ro", key, keyLocation: `https://www.habitoo.ro/${key}.txt`, urlList: urls }),
      });
      status = response.status;
      if (status !== 200 && status !== 202) break;
      // Delete only rows not re-enqueued meanwhile.
      for (const r of rows) await db.from("seo_indexnow_offer_queue").delete().eq("url", r.url).eq("enqueued_at", r.enqueued_at);
      sent += urls.length;
      if (rows.length < OFFER_INDEXNOW_BATCH) break;
    }
    console.info(`[indexnow] offers sent ${sent}, status ${status}`);
  } catch {
    console.warn("[indexnow] offer notification failed");
  } finally {
    await db.from("seo_indexnow_lock").update({ held_until: new Date().toISOString() }).eq("id", true);
  }
  return { sent, status };
}
