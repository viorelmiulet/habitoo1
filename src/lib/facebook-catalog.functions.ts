// Cardul „Catalog Facebook” (Setări → Promovare). Doar agency_admin/superadmin, doar agenția proprie.
// Nu returnează niciodată tokenul existent sau prefixul lui.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  facebookCatalogState,
  type FacebookCatalogState,
} from "@/lib/facebook-catalog-status";
import type { ExclusionReason } from "@/lib/site-feed/facebook-catalog";

export type FacebookCatalogOverview = {
  state: FacebookCatalogState;
  hasToken: boolean;
  /** Adresa completă, doar pentru tokenul `facebook_catalog` al agenției proprii. */
  feedUrl: string | null;
  /** Agenția are doar tokenuri de site (fără valoare recuperabilă). */
  hasLegacySiteToken: boolean;
  included: number;
  excluded: Record<ExclusionReason, number>;
  excludedTotal: number;
  excludedItems: { id: string; reference: string | null; title: string; reason: ExclusionReason }[];
  lastReadAt: string | null;
  agentsCanManage: boolean;
};

type Ctx = {
  supabase: {
    rpc: (fn: "is_org_admin") => PromiseLike<{ data: boolean | null; error: unknown }>;
    from: (t: "profiles") => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }>;
        };
      };
    };
  };
  userId: string;
};

async function requireCatalogAdmin(ctx: Ctx): Promise<string> {
    const { data: isAdmin, error } = await ctx.supabase.rpc("is_org_admin");
    if (error || isAdmin !== true) {
      setResponseStatus(403);
      throw new Error("Acces refuzat: doar administratorul agenției vede Catalogul Facebook.");
    }
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    const organizationId = profile?.organization_id;
    if (!organizationId) throw new Error("Agenția nu este configurată.");
    return organizationId;
}

export const getFacebookCatalogOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<FacebookCatalogOverview> => {
    setResponseHeader("Cache-Control", "no-store");
    const organizationId = await requireCatalogAdmin(context as unknown as Ctx);

    const [
      { supabaseAdmin },
      { loadFacebookCatalogInput },
      { buildFacebookCatalogCsv },
      { loadFacebookCatalogFeedUrl },
    ] = await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/site-feed/facebook-catalog.server"),
        import("@/lib/site-feed/facebook-catalog"),
        import("@/lib/site-feed/facebook-catalog-token.server"),
      ]);

    const [{ data: tokens }, { data: logs }, { data: lastOk }] = await Promise.all([
      supabaseAdmin
        .from("site_feed_tokens")
        .select("id")
        .eq("organization_id", organizationId)
        .in("scope", ["site", "facebook_catalog"])
        .is("revoked_at", null)
        .limit(1),
      supabaseAdmin
        .from("site_feed_access_logs")
        .select("status, token_prefix, created_at")
        .eq("organization_id", organizationId)
        .eq("endpoint", "catalog.facebook")
        .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("site_feed_access_logs")
        .select("created_at")
        .eq("organization_id", organizationId)
        .eq("endpoint", "catalog.facebook")
        .eq("status", 200)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const hasToken = (tokens ?? []).length > 0;
    const { data: organization } = await supabaseAdmin
      .from("organizations")
      .select("facebook_catalog_agents_enabled")
      .eq("id", organizationId)
      .maybeSingle();
    const feedUrl = await loadFacebookCatalogFeedUrl(supabaseAdmin, organizationId);
    const input = await loadFacebookCatalogInput(supabaseAdmin, organizationId);
    const result = buildFacebookCatalogCsv({
      ...input,
      baseUrl: "https://crm.habitoo.ro",
      publicSiteUrl: "https://habitoo.ro",
    });

    return {
      state: facebookCatalogState({
        hasToken,
        logs: (logs ?? []).map((l) => ({
          status: l.status,
          tokenPrefix: l.token_prefix,
          createdAt: l.created_at,
        })),
      }),
      hasToken,
      feedUrl,
      hasLegacySiteToken: hasToken && !feedUrl,
      included: result.included,
      excluded: result.excluded,
      excludedTotal: result.excludedTotal,
      excludedItems: (result.excludedItems ?? []).slice(0, 200),
      lastReadAt: lastOk?.[0]?.created_at ?? null,
      agentsCanManage: organization?.facebook_catalog_agents_enabled === true,
    };
  });

export const setFacebookCatalogAgentPermission = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<{ enabled: boolean }> => {
    setResponseHeader("Cache-Control", "no-store");
    const ctx = context as unknown as Ctx;
    const organizationId = await requireCatalogAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ facebook_catalog_agents_enabled: data.enabled })
      .eq("id", organizationId);
    if (error) throw error;
    return { enabled: data.enabled };
  });

/** Generează (sau regenerează) tokenul dedicat Catalogului Facebook. Nu atinge tokenurile de site. */
export const generateFacebookCatalogToken = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ feedUrl: string; regenerated: boolean }> => {
    setResponseHeader("Cache-Control", "no-store");
    const ctx = context as unknown as Ctx;
    const organizationId = await requireCatalogAdmin(ctx);
    const [{ supabaseAdmin }, { rotateFacebookCatalogToken }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/site-feed/facebook-catalog-token.server"),
    ]);
    const res = await rotateFacebookCatalogToken(supabaseAdmin, organizationId, ctx.userId);
    return { feedUrl: res.url, regenerated: res.regenerated };
  });
