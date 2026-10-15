// Postare directă pe Instagram din fila „Promovare”. Tokenul paginii rămâne pe server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { loadProperty, roleOf, type Ctx } from "./post.functions";
import type { IgPostKind } from "./instagram-core";

const Input = z.object({
  propertyId: z.string().uuid(),
  igUserId: z.string().min(1).max(64),
  kind: z.enum(["ig_poster", "ig_album", "ig_photo", "ig_reel", "ig_story"]),
  caption: z.string().max(2200),
});

export const publishInstagramPost = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Date invalide.");
    const parsed = Input.parse({ propertyId: d.get("propertyId"), igUserId: d.get("igUserId"), kind: d.get("kind"), caption: d.get("caption") ?? "" });
    const images = d.getAll("images").filter((f): f is File => f instanceof Blob);
    const video = d.get("video");
    return { ...parsed, images, video: video instanceof Blob ? video : null, musicTrackId: d.get("musicTrackId") };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const core = await import("./instagram-core");
    const { canPostForProperty, META_RECONNECT_MESSAGE, META_VIDEO_MAX_BYTES } = await import("./post-core");
    const p = await loadProperty(ctx, data.propertyId);
    if (!canPostForProperty({ role: await roleOf(ctx), userId: ctx.userId, assignedTo: p.assigned_to })) {
      throw new Error("Poți posta doar pentru proprietățile tale.");
    }
    const kind = data.kind as IgPostKind;
    const capErr = core.validateInstagramCaption(data.caption);
    if (capErr) throw new Error(capErr);
    if (data.images.length > core.IG_ALBUM_MAX) throw new Error(`Maximum ${core.IG_ALBUM_MAX} poze.`);
    if (data.images.some((f) => f.type !== "image/jpeg")) throw new Error("Instagram acceptă doar imagini JPEG.");
    if (data.video && data.video.size > META_VIDEO_MAX_BYTES) throw new Error("Video-ul depășește 100 MB.");
    const usesVideo = kind === "ig_reel" || (kind === "ig_story" && !!data.video);
    // validează numărul de fișiere înainte de orice încărcare
    core.planInstagramPost(kind, { images: data.images.map(() => "x"), videoUrl: usesVideo && data.video ? "x" : null }, data.caption);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: conn } = await db.from("meta_connections").select("id, status").eq("organization_id", p.organization_id).maybeSingle();
    if (!conn || conn.status !== "connected") throw new Error(META_RECONNECT_MESSAGE + ".");
    const { data: acc } = await db
      .from("meta_instagram_accounts")
      .select("ig_user_id, username, meta_pages(page_token_enc)")
      .eq("organization_id", p.organization_id)
      .eq("ig_user_id", data.igUserId)
      .maybeSingle();
    const tokenEnc = acc?.meta_pages?.page_token_enc;
    if (!acc || !tokenEnc) throw new Error("Contul de Instagram nu aparține conexiunii agenției.");
    const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const token = decryptPortalCredential(tokenEnc);
    if (!token) throw new Error(META_RECONNECT_MESSAGE + ".");

    // Fișiere temporare private, link semnat 1 oră, șterse după 24 h.
    const upload = async (blob: Blob, ext: string) => {
      const path = `${p.organization_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabaseAdmin.storage.from("social-temp").upload(path, blob, { contentType: blob.type || (ext === "mp4" ? "video/mp4" : "image/jpeg") });
      if (error) throw new Error("Încărcarea fișierului nu a reușit. Încearcă din nou.");
      await db.from("social_temp_files").insert({ path, organization_id: p.organization_id });
      const { data: s } = await supabaseAdmin.storage.from("social-temp").createSignedUrl(path, core.IG_TEMP_URL_TTL);
      if (!s?.signedUrl) throw new Error("Nu am putut pregăti fișierul pentru Instagram.");
      return s.signedUrl;
    };
    const images: string[] = [];
    for (const f of data.images) images.push(await upload(f, "jpg"));
    const videoUrl = usesVideo && data.video ? await upload(data.video, "mp4") : null;

    const { data: row } = await db
      .from("meta_posts")
      .insert({ organization_id: p.organization_id, property_id: p.id, page_id: acc.ig_user_id, page_name: acc.username, kind, platform: "instagram", status: "pending", posted_by: ctx.userId, music_track_id: usesVideo ? (await import("@/lib/video-music")).cleanTrackId(data.musicTrackId) : null })
      .select("id, organization_id, property_id, posted_by, page_name, kind")
      .single();

    const { publishToInstagram } = await import("./instagram.server");
    const fin = await import("./instagram-finalize.server");
    try {
      const res = await publishToInstagram({ igUserId: acc.ig_user_id, token, kind, caption: data.caption, media: { images, videoUrl } });
      if (res.status === "processing") {
        await db.from("meta_posts").update({ status: "processing", container_id: res.containerId, processing_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }).eq("id", row.id);
        return { ok: true as const, background: true as const, username: acc.username as string | null };
      }
      const publishedAt = await fin.markInstagramPublished(db, row, res, false);
      return { ok: true as const, background: false as const, username: acc.username as string | null, permalink: res.permalink, publishedAt };
    } catch (e) {
      const err = e instanceof core.IgPostError ? e : new core.IgPostError("rejected", e instanceof Error ? e.message : "Postarea nu a reușit. Încearcă din nou.");
      await fin.markInstagramFailed(db, row, { message: err.message, code: err.code, raw: err.raw, kind: err.kind }, conn.id, false);
      return { ok: false as const, error: err.message, kind: err.igKind };
    }
  });
