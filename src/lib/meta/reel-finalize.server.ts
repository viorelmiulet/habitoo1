import { MetaPostError } from "./post-core";
import { facebookReelPermalink, facebookReelStatus } from "./reel.server";
type Db = any;
type Row = { id: string; organization_id: string; property_id: string; posted_by: string | null; page_name: string | null; page_id: string; container_id: string; processing_until: string | null };

export async function markFacebookReelPublished(db: Db, row: Pick<Row, "id" | "organization_id" | "property_id" | "posted_by" | "page_name">, result: { postId: string; permalink: string | null }) {
  const now = new Date().toISOString();
  const { data, error } = await db.from("meta_posts").update({ status: "published", post_id: result.postId, permalink_url: result.permalink, published_at: now, processing_until: null }).eq("id", row.id).in("status", ["pending", "processing"]).select("id");
  if (error) throw new Error("Rezultatul Reel-ului nu a putut fi salvat.");
  if (data?.length) await db.from("audit_logs").insert({ organization_id: row.organization_id, actor_id: row.posted_by, action: `Postat pe Facebook (${row.page_name ?? ""})`, entity: "property", entity_id: row.property_id, new_values: { kind: "reel", permalink: result.permalink } });
  return now;
}

export async function reconcileFacebookReel(db: Db, row: Row) {
  const { data: page } = await db.from("meta_pages").select("page_token_enc").eq("organization_id", row.organization_id).eq("page_id", row.page_id).maybeSingle();
  const { data: conn } = await db.from("meta_connections").select("id, status").eq("organization_id", row.organization_id).maybeSingle();
  const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
  try {
    const token = page?.page_token_enc && conn?.status === "connected" ? decryptPortalCredential(page.page_token_enc) : null;
    if (!token) throw new MetaPostError("expired", "Conexiunea Facebook a expirat. Reconectează pagina din Setări → Promovare.");
    if (await facebookReelStatus(row.container_id, token) === "published") {
      await markFacebookReelPublished(db, row, { postId: row.container_id, permalink: await facebookReelPermalink(row.container_id, token) });
      return true;
    }
    if (row.processing_until && row.processing_until < new Date().toISOString()) throw new MetaPostError("rejected", "Facebook nu a confirmat publicarea Reel-ului în 24 de ore. Verifică pagina înainte de a încerca din nou.");
  } catch (e) {
    if (!(e instanceof MetaPostError) || e.message === "Facebook nu a răspuns. Încearcă din nou.") return false;
    await db.from("meta_posts").update({ status: "failed", error: e.message, error_code: e.code ?? null, error_message_raw: e.raw ?? null, processing_until: null }).eq("id", row.id).eq("status", "processing");
    if (e.kind === "expired" && conn?.id) await db.from("meta_connections").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", conn.id);
  }
  return false;
}