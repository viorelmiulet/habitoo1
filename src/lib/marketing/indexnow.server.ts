import { changedRevisions, type ContentRevision } from "./indexnow";

/** Disabled until public verification is approved; a private secret is never served. */
export async function notifyIndexNow(current: ContentRevision[]): Promise<void> {
  if (process.env["INDEXNOW_PUBLIC_VERIFICATION_APPROVED"] !== "true") return;
  const key = process.env["INDEXNOW_KEY"];
  if (!key) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("seo_indexnow_claim");
  if (claimError || !claimed) return;
  try {
    const { data, error } = await supabaseAdmin.from("seo_indexnow_receipts").select("url,revision").in("url", current.map(item => item.url));
    if (error) return;
    const changed = changedRevisions(current, data ?? []);
    if (!changed.length) return;
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ host: "www.habitoo.ro", key, keyLocation: "https://www.habitoo.ro/indexnow-key.txt", urlList: changed.map(item => item.url) }),
    });
    if (response.status === 200 || response.status === 202) await supabaseAdmin.from("seo_indexnow_receipts").upsert(changed.map(item => ({ ...item, sent_at: new Date().toISOString() })));
  } catch {
    console.warn("[indexnow] notification failed");
  } finally {
    await supabaseAdmin.from("seo_indexnow_lock").update({ held_until: new Date().toISOString() }).eq("id", true);
  }
}