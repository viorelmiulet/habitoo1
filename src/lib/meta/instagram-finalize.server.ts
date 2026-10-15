/** Încheierea unei postări Instagram (imediat sau din fundal): istoric, jurnal, notificare. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const IG_KIND_LABEL: Record<string, string> = {
  ig_poster: "poster", ig_album: "album", ig_photo: "poză", ig_reel: "Reel", ig_story: "story",
};

export async function markInstagramPublished(db: Db, row: { id: string; organization_id: string; property_id: string; posted_by: string | null; page_name: string | null; kind: string }, res: { mediaId: string; permalink: string | null }, notify: boolean) {
  const now = new Date().toISOString();
  await db.from("meta_posts").update({ status: "published", post_id: res.mediaId, permalink_url: res.permalink, published_at: now, processing_until: null }).eq("id", row.id);
  await db.from("audit_logs").insert({
    organization_id: row.organization_id,
    actor_id: row.posted_by,
    action: `Postat pe Instagram (@${row.page_name ?? ""})`,
    entity: "property",
    entity_id: row.property_id,
    new_values: { kind: row.kind, permalink: res.permalink },
  });
  if (notify && row.posted_by) {
    await db.from("notifications").insert({
      organization_id: row.organization_id,
      user_id: row.posted_by,
      type: "meta_post",
      title: "Postarea pe Instagram este gata",
      body: `${IG_KIND_LABEL[row.kind] ?? "Postarea"} a fost publicat pe @${row.page_name ?? ""}.`,
      link: `/app/properties/${row.property_id}?tab=promotion`,
      created_by: row.posted_by,
    });
  }
  return now;
}

export async function markInstagramFailed(db: Db, row: { id: string; organization_id: string; property_id: string; posted_by: string | null; page_name: string | null }, err: { message: string; code?: number; raw?: string; kind?: string }, connId: string | null, notify: boolean) {
  await db.from("meta_posts").update({ status: "failed", error: err.message, error_code: err.code ?? null, error_message_raw: err.raw ?? null, processing_until: null }).eq("id", row.id);
  if (err.kind === "expired" && connId) {
    await db.from("meta_connections").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", connId);
  }
  if (notify && row.posted_by) {
    await db.from("notifications").insert({
      organization_id: row.organization_id,
      user_id: row.posted_by,
      type: "meta_post",
      title: "Postarea pe Instagram nu a reușit",
      body: err.message.slice(0, 300),
      link: `/app/properties/${row.property_id}?tab=promotion`,
      created_by: row.posted_by,
    });
  }
}
