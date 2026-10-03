// Cardul „Catalog Facebook” (Setări → Promovare). Doar agency_admin/superadmin, doar agenția proprie.
// Nu returnează niciodată tokenul existent sau prefixul lui.
import { createServerFn } from "@tanstack/react-start";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  facebookCatalogState,
  type FacebookCatalogState,
} from "@/lib/facebook-catalog-status";
import type { ExclusionReason } from "@/lib/site-feed/facebook-catalog";

export type FacebookCatalogOverview = {
  state: FacebookCatalogState;
  hasToken: boolean;
  included: number;
  excluded: Record<ExclusionReason, number>;
  excludedTotal: number;
  excludedItems: { id: string; reference: string | null; title: string; reason: ExclusionReason }[];
  lastReadAt: string | null;
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

export const getFacebookCatalogOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<FacebookCatalogOverview> => {
    const ctx = context as unknown as Ctx;
    const { data: isAdmin, error } = await ctx.supabase.rpc("is_org_admin");
    if (error || isAdmin !== true) {
      throw new Error("Acces refuzat: doar administratorul agenției vede Catalogul Facebook.");
    }
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    const organizationId = profile?.organization_id;
    if (!organizationId) throw new Error("Agenția nu este configurată.");

    const [{ supabaseAdmin }, { loadFacebookCatalogInput }, { buildFacebookCatalogCsv }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/site-feed/facebook-catalog.server"),
        import("@/lib/site-feed/facebook-catalog"),
      ]);

    const [{ data: tokens }, { data: logs }, { data: lastOk }] = await Promise.all([
      supabaseAdmin
        .from("site_feed_tokens")
        .select("id")
        .eq("organization_id", organizationId)
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
      included: result.included,
      excluded: result.excluded,
      excludedTotal: result.excludedTotal,
      excludedItems: (result.excludedItems ?? []).slice(0, 200),
      lastReadAt: lastOk?.[0]?.created_at ?? null,
    };
  });
