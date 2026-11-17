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