// Postare directă pe pagina de Facebook a agenției, din fila „Promovare”.
// Tokenurile paginilor rămân pe server; browserul primește doar id/nume pagină.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { MetaPostKind } from "./post-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctx = { supabase: any; userId: string };

export type MetaPostingContext = {
  status: "none" | "connected" | "disconnected" | "expired";
  defaultPageId: string | null;
  pages: { pageId: string; name: string; pictureUrl: string | null }[];
  lastPost: { pageName: string | null; permalink: string | null; publishedAt: string | null } | null;
  instagram: { igUserId: string; username: string | null; pictureUrl: string | null }[];
  lastInstagramPost: { username: string | null; permalink: string | null; publishedAt: string | null } | null;
  agentPhone: string | null;
};

export async function roleOf(ctx: Ctx): Promise<"superadmin" | "agency_admin" | "agent" | null> {
  for (const r of ["superadmin", "agency_admin", "agent"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r });
    if (data === true) return r;
  }
  return null;
}

export async function loadProperty(ctx: Ctx, propertyId: string) {
  const { data: p } = await ctx.supabase
    .from("properties")
    .select("id, organization_id, assigned_to")
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!p) throw new Error("Anunțul nu există sau nu ai acces la el.");
  return p as { id: string; organization_id: string; assigned_to: string | null };
}

export const getMetaPostingContext = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MetaPostingContext> => {
    setResponseHeader("Cache-Control", "no-store");
    const p = await loadProperty(context as unknown as Ctx, data.propertyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const [{ data: conn }, { data: pages }, { data: posts }, { data: igs }, { data: igPosts }, { data: agent }] = await Promise.all([
      db.from("meta_connections").select("status, default_page_id").eq("organization_id", p.organization_id).maybeSingle(),
      db.from("meta_pages").select("page_id, name, picture_url").eq("organization_id", p.organization_id).order("name"),
      db
        .from("meta_posts")
        .select("page_name, permalink_url, published_at")
        .eq("property_id", p.id)
        .eq("platform", "facebook")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1),
      db.from("meta_instagram_accounts").select("ig_user_id, username, picture_url").eq("organization_id", p.organization_id).order("username"),
      db
        .from("meta_posts")
        .select("page_name, permalink_url, published_at")
        .eq("property_id", p.id)
        .eq("platform", "instagram")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1),
      p.assigned_to ? db.from("profiles").select("phone").eq("id", p.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const lastIg = igPosts?.[0];
    const last = posts?.[0];
    return {
      status: conn?.status ?? "none",
      defaultPageId: conn?.default_page_id ?? null,
      pages: conn?.status === "connected"
        ? ((pages ?? []) as { page_id: string; name: string; picture_url: string | null }[]).map((x) => ({ pageId: x.page_id, name: x.name, pictureUrl: x.picture_url }))
        : [],
      lastPost: last ? { pageName: last.page_name, permalink: last.permalink_url, publishedAt: last.published_at } : null,
      instagram: conn?.status === "connected"
        ? ((igs ?? []) as { ig_user_id: string; username: string | null; picture_url: string | null }[]).map((x) => ({ igUserId: x.ig_user_id, username: x.username, pictureUrl: x.picture_url }))
        : [],
      lastInstagramPost: lastIg ? { username: lastIg.page_name, permalink: lastIg.permalink_url, publishedAt: lastIg.published_at } : null,
      agentPhone: (agent as { phone: string | null } | null)?.phone ?? null,
    };
  });

const PostInput = z.object({
  propertyId: z.string().uuid(),
  pageId: z.string().min(1).max(64),
  kind: z.enum(["photos", "poster", "video", "link"]),
  message: z.string().max(60000),
  photoIds: z.array(z.string().uuid()).max(10),
});

export const publishMetaPost = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Date invalide.");
    const file = d.get("file");
    const parsed = PostInput.parse({
      propertyId: d.get("propertyId"),
      pageId: d.get("pageId"),
      kind: d.get("kind"),
      message: d.get("message") ?? "",
      photoIds: JSON.parse(String(d.get("photoIds") ?? "[]")),
    });
    return { ...parsed, file: file instanceof Blob ? file : null };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const core = await import("./post-core");
    const p = await loadProperty(ctx, data.propertyId);
    if (!core.canPostForProperty({ role: await roleOf(ctx), userId: ctx.userId, assignedTo: p.assigned_to })) {
      throw new Error("Poți posta doar pentru proprietățile tale.");
    }
    const kind = data.kind as MetaPostKind;
    if ((kind === "poster" || kind === "video") && !data.file) throw new Error(kind === "video" ? "Creează întâi video-ul." : "Creează întâi posterul.");
    if (kind === "video" && data.file!.size > core.META_VIDEO_MAX_BYTES) throw new Error("Video-ul depășește 100 MB.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: conn } = await db.from("meta_connections").select("id, status").eq("organization_id", p.organization_id).maybeSingle();
    if (!conn || conn.status !== "connected") throw new Error(core.META_RECONNECT_MESSAGE + ".");
    const { data: page } = await db
      .from("meta_pages")
      .select("page_id, name, page_token_enc")
      .eq("organization_id", p.organization_id)
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (!page?.page_token_enc) throw new Error("Pagina nu aparține conexiunii agenției.");

    let photoUrls: string[] = [];
    if (kind === "photos") {
      const { data: imgs } = await db
        .from("property_images")
        .select("id")
        .eq("property_id", p.id)
        .eq("include_in_publish", true)
        .eq("is_confidential", false)
        .in("id", data.photoIds);
      const ok = new Set(((imgs ?? []) as { id: string }[]).map((i) => i.id));
      photoUrls = data.photoIds.filter((id) => ok.has(id)).map((id) => `https://crm.habitoo.ro/api/public/sites/v1/media/${id}.jpg`);
    }

    const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const token = decryptPortalCredential(page.page_token_enc);
    if (!token) throw new Error(core.META_RECONNECT_MESSAGE + ".");

    const { data: row } = await db
      .from("meta_posts")
      .insert({ organization_id: p.organization_id, property_id: p.id, page_id: page.page_id, page_name: page.name, kind, status: "pending", posted_by: ctx.userId })
      .select("id")
      .single();

    const { publishToMetaPage } = await import("./post.server");
    try {
      const res = await publishToMetaPage({
        pageId: page.page_id,
        pageToken: token,
        kind,
        message: core.withOfferLink(data.message, p.id),
        link: (await import("@/lib/share")).offerShareUrl(p.id),
        photoUrls,
        file: data.file,
        fileName: kind === "video" ? "video.mp4" : "poster.png",
      });
      const now = new Date().toISOString();
      await db.from("meta_posts").update({ status: "published", post_id: res.postId, permalink_url: res.permalink, published_at: now }).eq("id", row?.id);
      await db.from("audit_logs").insert({
        organization_id: p.organization_id,
        actor_id: ctx.userId,
        action: `Postat pe Facebook (${page.name})`,
        entity: "property",
        entity_id: p.id,
        new_values: { kind, permalink: res.permalink },
      });
      return { ok: true as const, permalink: res.permalink, pageName: page.name as string, publishedAt: now };
    } catch (e) {
      const err = e instanceof core.MetaPostError ? e : new core.MetaPostError("rejected", "Postarea nu a reușit. Încearcă din nou.");
      await db.from("meta_posts").update({ status: "failed", error: err.message, error_code: err.code ?? null, error_message_raw: err.raw ?? null }).eq("id", row?.id);
      if (err.kind === "expired") {
        await db.from("meta_connections").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", conn.id);
      }
      return { ok: false as const, error: err.message, kind: err.kind };
    }
  });
