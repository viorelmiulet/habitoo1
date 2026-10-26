// YouTube: conexiunea canalului (Setări → Promovare, doar admin) și publicarea din fila „Promovare”.
// Tokenurile rămân pe server; browserul primește doar adresa sesiunii de încărcare.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { loadProperty, roleOf, type Ctx } from "@/lib/meta/post.functions";

export type YoutubeOverview = {
  configured: boolean;
  status: "none" | "connected" | "disconnected" | "expired";
  channel: { id: string; title: string | null; thumbnail: string | null } | null;
  connectedAt: string | null;
  connectedByName: string | null;
};

export type YoutubePostingContext = {
  status: YoutubeOverview["status"];
  channelTitle: string | null;
  lastPost: { channelTitle: string | null; url: string | null; publishedAt: string | null } | null;
};

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

async function requireAdminOrg(ctx: Ctx): Promise<string> {
  const { data: isAdmin, error } = await ctx.supabase.rpc("is_org_admin");
  if (error || isAdmin !== true) {
    setResponseStatus(403);
    throw new Error("Acces refuzat: doar administratorul agenției gestionează conectarea YouTube.");
  }
  const { data: profile } = await ctx.supabase.from("profiles").select("organization_id").eq("id", ctx.userId).maybeSingle();
  if (!profile?.organization_id) throw new Error("Agenția nu este configurată.");
  return profile.organization_id as string;
}

export const getYoutubeOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<YoutubeOverview> => {
    setResponseHeader("Cache-Control", "no-store");
    const orgId = await requireAdminOrg(context as unknown as Ctx);
    const db = await adminDb();
    const { data: c } = await db
      .from("youtube_connections")
      .select("status, channel_id, channel_title, channel_thumbnail, connected_at, connected_by")
      .eq("organization_id", orgId)
      .maybeSingle();
    const configured = !!process.env["GOOGLE_YT_CLIENT_SECRET"];
    if (!c) return { configured, status: "none", channel: null, connectedAt: null, connectedByName: null };
    const { data: by } = c.connected_by ? await db.from("profiles").select("full_name").eq("id", c.connected_by).maybeSingle() : { data: null };
    return {
      configured,
      status: c.status,
      channel: c.channel_id ? { id: c.channel_id, title: c.channel_title, thumbnail: c.channel_thumbnail } : null,
      connectedAt: c.connected_at,
      connectedByName: by?.full_name ?? null,
    };
  });

export const startYoutubeConnect = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const { youtubeClientSecret } = await import("./youtube.server");
    const { buildYoutubeOAuthUrl } = await import("./core");
    const { signYoutubeState } = await import("./state.server");
    return { url: buildYoutubeOAuthUrl(signYoutubeState({ organizationId: orgId, userId: ctx.userId }, youtubeClientSecret())) };
  });

export const disconnectYoutube = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const db = await adminDb();
    const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const { revokeYoutubeToken } = await import("./core");
    const { data: c } = await db.from("youtube_connections").select("id, refresh_token_enc").eq("organization_id", orgId).maybeSingle();
    let revoked = false;
    if (c?.refresh_token_enc) {
      try {
        const t = decryptPortalCredential(c.refresh_token_enc);
        if (t) {
          await revokeYoutubeToken(t);
          revoked = true;
        }
      } catch {
        revoked = false;
      }
    }
    const now = new Date().toISOString();
    if (c) await db.from("youtube_connections").update({ refresh_token_enc: null, status: "disconnected", disconnected_at: now, updated_at: now }).eq("id", c.id);
    await db.from("audit_logs").insert({ organization_id: orgId, actor_id: ctx.userId, action: "youtube.disconnected", entity: "youtube_connection", new_values: { revoked } });
    return { ok: true };
  });

export const getYoutubePostingContext = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<YoutubePostingContext> => {
    setResponseHeader("Cache-Control", "no-store");
    const p = await loadProperty(context as unknown as Ctx, data.propertyId);
    const db = await adminDb();
    const [{ data: c }, { data: posts }] = await Promise.all([
      db.from("youtube_connections").select("status, channel_title").eq("organization_id", p.organization_id).maybeSingle(),
      db
        .from("meta_posts")
        .select("page_name, permalink_url, published_at")
        .eq("property_id", p.id)
        .eq("platform", "youtube")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1),
    ]);
    const last = posts?.[0];
    return {
      status: c?.status ?? "none",
      channelTitle: c?.channel_title ?? null,
      lastPost: last ? { channelTitle: last.page_name, url: last.permalink_url, publishedAt: last.published_at } : null,
    };
  });

async function authorizeProperty(ctx: Ctx, propertyId: string) {
  const p = await loadProperty(ctx, propertyId);
  const { canPostForProperty } = await import("@/lib/meta/post-core");
  if (!canPostForProperty({ role: await roleOf(ctx), userId: ctx.userId, assignedTo: p.assigned_to })) {
    throw new Error("Poți publica doar pentru proprietățile tale.");
  }
  return p;
}

type Fail = { ok: false; error: string; kind: string };
async function failRow(db: ReturnType<typeof adminDb> extends Promise<infer T> ? T : never, rowId: string | null, e: unknown, connId?: string): Promise<Fail> {
  const core = await import("./core");
  const err = e instanceof core.YoutubeError ? e : new core.YoutubeError("rejected", "Publicarea nu a reușit. Încearcă din nou.");
  if (rowId) await db.from("meta_posts").update({ status: "failed", error: err.message, error_message_raw: err.reason ?? null, container_id: null }).eq("id", rowId);
  if (err.kind === "expired" && connId) {
    const { markYoutubeExpired } = await import("./youtube.server");
    await markYoutubeExpired(db, connId);
  }
  return { ok: false, error: err.message, kind: err.kind };
}

const StartInput = z.object({
  propertyId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000),
  tags: z.array(z.string().max(100)).max(100),
  privacy: z.enum(["public", "unlisted", "private"]),
  size: z.number().int().positive(),
  musicTrackId: z.string().uuid().nullable().optional(),
});

/** Pornește sesiunea resumable și întoarce adresa la care browserul încarcă MP4-ul. */
export const startYoutubeUpload = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; rowId: string; uploadUrl: string } | Fail> => {
    const ctx = context as unknown as Ctx;
    const core = await import("./core");
    const p = await authorizeProperty(ctx, data.propertyId);
    if (data.size > core.YT_VIDEO_MAX_BYTES) throw new Error("Video-ul depășește 100 MB.");
    const db = await adminDb();
    const { youtubeAccessToken } = await import("./youtube.server");
    let connId: string | undefined;
    let rowId: string | null = null;
    try {
      const { token, conn } = await youtubeAccessToken(db, p.organization_id);
      connId = conn.id;
      const { data: row } = await db
        .from("meta_posts")
        .insert({ organization_id: p.organization_id, property_id: p.id, platform: "youtube", page_id: conn.channel_id, page_name: conn.channel_title, kind: "yt_video", status: "pending", posted_by: ctx.userId, music_track_id: data.musicTrackId ?? null })
        .select("id")
        .single();
      rowId = row?.id ?? null;
      const resource = core.youtubeVideoResource({
        title: core.youtubeTitle(data.title, null),
        description: core.youtubeDescription(data.description, p.id),
        tags: core.youtubeTags(data.tags),
        privacy: data.privacy,
      });
      const uploadUrl = await core.startResumableUpload(token, resource, data.size);
      await db.from("meta_posts").update({ container_id: uploadUrl }).eq("id", rowId);
      return { ok: true, rowId: rowId!, uploadUrl };
    } catch (e) {
      return failRow(db, rowId, e, connId);
    }
  });

async function loadRow(ctx: Ctx, rowId: string) {
  const db = await adminDb();
  const { data: row } = await db
    .from("meta_posts")
    .select("id, property_id, organization_id, page_name, container_id, status, posted_by")
    .eq("id", rowId)
    .eq("platform", "youtube")
    .maybeSingle();
  if (!row || row.posted_by !== ctx.userId || row.status !== "pending") throw new Error("Încărcarea nu mai este activă.");
  await authorizeProperty(ctx, row.property_id);
  return { db, row };
}

async function completeRow(ctx: Ctx, rowId: string, videoId: string) {
  const { db, row } = await loadRow(ctx, rowId);
  const core = await import("./core");
  const { youtubeAccessToken } = await import("./youtube.server");
  let connId: string | undefined;
  try {
    const { token, conn } = await youtubeAccessToken(db, row.organization_id);
    connId = conn.id;
    await core.checkUploadedVideo(token, videoId);
    const url = core.youtubeWatchUrl(videoId);
    const now = new Date().toISOString();
    await db.from("meta_posts").update({ status: "published", post_id: videoId, permalink_url: url, published_at: now, container_id: null }).eq("id", row.id);
    await db.from("audit_logs").insert({
      organization_id: row.organization_id,
      actor_id: ctx.userId,
      action: `Publicat pe YouTube (${row.page_name ?? "canal"})`,
      entity: "property",
      entity_id: row.property_id,
      new_values: { url },
    });
    return { ok: true as const, url, channelTitle: row.page_name as string | null, publishedAt: now };
  } catch (e) {
    return failRow(db, row.id, e, connId);
  }
}

/** Browserul a terminat PUT-ul direct; serverul verifică video-ul pe canal și salvează linkul. */
export const finishYoutubeUpload = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ rowId: z.string().uuid(), videoId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/) }).parse(d))
  .handler(async ({ data, context }) => completeRow(context as unknown as Ctx, data.rowId, data.videoId));

/** Rezervă: dacă PUT-ul direct e blocat (CORS), serverul încarcă MP4-ul (max 100 MB). */
export const uploadYoutubeViaServer = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Date invalide.");
    const file = d.get("file");
    if (!(file instanceof Blob)) throw new Error("Lipsește video-ul.");
    return { rowId: z.string().uuid().parse(d.get("rowId")), file };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const core = await import("./core");
    if (data.file.size > core.YT_VIDEO_MAX_BYTES) throw new Error("Video-ul depășește 100 MB.");
    const { db, row } = await loadRow(ctx, data.rowId);
    if (!row.container_id) throw new Error("Încărcarea nu mai este activă.");
    let res: Response;
    try {
      res = await fetch(row.container_id, { method: "PUT", headers: { "content-type": "video/mp4" }, body: data.file });
    } catch (e) {
      return failRow(db, row.id, e);
    }
    const j = (await res.json().catch(() => null)) as { id?: string } | null;
    if (!res.ok || !j?.id) return failRow(db, row.id, core.classifyYoutubeError(j));
    return completeRow(ctx, row.id, j.id);
  });

export const failYoutubeUpload = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ rowId: z.string().uuid(), message: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, row } = await loadRow(context as unknown as Ctx, data.rowId);
    await db.from("meta_posts").update({ status: "failed", error: data.message, container_id: null }).eq("id", row.id);
    return { ok: true };
  });
