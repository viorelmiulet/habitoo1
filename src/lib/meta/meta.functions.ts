// Setări → Promovare: conexiunea Facebook/Instagram a agenției. Doar agency_admin/superadmin.
// Nu întoarce niciodată tokenuri.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

export type MetaOverview = {
  configured: boolean;
  status: "none" | "connected" | "disconnected";
  connectedAt: string | null;
  connectedByName: string | null;
  defaultPageId: string | null;
  pages: {
    pageId: string;
    name: string;
    pictureUrl: string | null;
    instagram: { id: string; username: string | null; pictureUrl: string | null } | null;
  }[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function requireAdminOrg(ctx: Ctx): Promise<string> {
  const { data: isAdmin, error } = await ctx.supabase.rpc("is_org_admin");
  if (error || isAdmin !== true) {
    setResponseStatus(403);
    throw new Error("Acces refuzat: doar administratorul agenției gestionează conectarea Facebook.");
  }
  const { data: profile } = await ctx.supabase.from("profiles").select("organization_id").eq("id", ctx.userId).maybeSingle();
  if (!profile?.organization_id) throw new Error("Agenția nu este configurată.");
  return profile.organization_id as string;
}

export const getMetaOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<MetaOverview> => {
    setResponseHeader("Cache-Control", "no-store");
    const orgId = await requireAdminOrg(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as Ctx["supabase"];
    const { data: conn } = await db
      .from("meta_connections")
      .select("status, connected_at, connected_by, default_page_id")
      .eq("organization_id", orgId)
      .maybeSingle();
    const configured = !!process.env["META_APP_SECRET"];
    if (!conn) return { configured, status: "none", connectedAt: null, connectedByName: null, defaultPageId: null, pages: [] };
    const [{ data: pages }, { data: igs }, { data: by }] = await Promise.all([
      db.from("meta_pages").select("id, page_id, name, picture_url").eq("organization_id", orgId).order("name"),
      db.from("meta_instagram_accounts").select("page_row_id, ig_user_id, username, picture_url").eq("organization_id", orgId),
      conn.connected_by
        ? db.from("profiles").select("full_name").eq("id", conn.connected_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      configured,
      status: conn.status,
      connectedAt: conn.connected_at,
      connectedByName: by?.full_name ?? null,
      defaultPageId: conn.default_page_id,
      pages: ((pages ?? []) as { id: string; page_id: string; name: string; picture_url: string | null }[]).map((p) => {
        const ig = ((igs ?? []) as { page_row_id: string; ig_user_id: string; username: string | null; picture_url: string | null }[]).find(
          (i) => i.page_row_id === p.id,
        );
        return {
          pageId: p.page_id,
          name: p.name,
          pictureUrl: p.picture_url,
          instagram: ig ? { id: ig.ig_user_id, username: ig.username, pictureUrl: ig.picture_url } : null,
        };
      }),
    };
  });

export const startMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const secret = process.env["META_APP_SECRET"];
    if (!secret) throw new Error("Conectarea Facebook nu este configurată încă.");
    const { signMetaState, buildMetaOAuthUrl } = await import("./core");
    return { url: buildMetaOAuthUrl(signMetaState({ organizationId: orgId, userId: ctx.userId }, secret)) };
  });

export const setDefaultMetaPage = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ pageId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await requireAdminOrg(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never as Ctx["supabase"];
    const { data: page } = await db.from("meta_pages").select("id").eq("organization_id", orgId).eq("page_id", data.pageId).maybeSingle();
    if (!page) throw new Error("Pagina nu aparține conexiunii agenției.");
    await db.from("meta_connections").update({ default_page_id: data.pageId, updated_at: new Date().toISOString() }).eq("organization_id", orgId);
    return { ok: true };
  });

export const disconnectMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { disconnectMeta, metaAudit } = await import("./meta.server");
    const result = await disconnectMeta(supabaseAdmin, orgId);
    await metaAudit(supabaseAdmin, orgId, ctx.userId, "meta.disconnected", { revoked: result.revoked });
    return { ok: true };
  });

/** Public: starea unei cereri de ștergere, după codul de confirmare (doar status). */
export const getMetaDeletionStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(/^[0-9a-f]{24}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as never as Ctx["supabase"])
      .from("meta_data_deletion_requests")
      .select("status, created_at, completed_at")
      .eq("confirmation_code", data.code)
      .maybeSingle();
    return row
      ? { found: true as const, status: row.status as string, createdAt: row.created_at as string, completedAt: row.completed_at as string | null }
      : { found: false as const };
  });
