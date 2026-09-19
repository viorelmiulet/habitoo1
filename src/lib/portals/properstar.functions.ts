/**
 * Raportul de agenție pentru feedul Properstar: câte oferte intră în feed și
 * ce lipsește la cele excluse („De completat pentru Properstar").
 *
 * Read-only: nu publică nimic, nu modifică nimic. Agenția vine din sesiune,
 * niciodată din input.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireActiveOrgAuth } from "@/lib/org-access";

export type ProperstarReportItem = {
  propertyId: string;
  reference: string | null;
  title: string | null;
  missing: string[];
};

export type ProperstarFeedReport = {
  organizationId: string;
  /** URL-ul pe care îl dai Properstar (cheia se generează separat). */
  feedUrlTemplate: string;
  hasActiveKey: boolean;
  keyPrefix: string | null;
  selected: number;
  active: number;
  deleted: number;
  excluded: ProperstarReportItem[];
  lastFetchAt: string | null;
  lastFetchItems: number | null;
};

type AuthContext = {
  supabase: {
    from: (table: "profiles") => {
      select: (cols: string) => {
        eq: (
          col: string,
          value: string,
        ) => {
          maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }>;
        };
      };
    };
  };
  userId: string;
};

async function organizationOf(context: AuthContext): Promise<string> {
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Agenția nu este configurată.");
  return profile.organization_id;
}

export const getProperstarFeedReport = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ProperstarFeedReport> => {
    const organizationId = await organizationOf(context as unknown as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildProperstarFeed, properstarFeedPath } = await import(
      "@/lib/portals/properstar/feed.server"
    );
    const { CRM_URL } = await import("@/lib/host");

    const build = await buildProperstarFeed({
      organizationId,
      requestUrl: `${CRM_URL}${properstarFeedPath("preview")}`,
    });

    const [{ data: keys }, { data: logs }] = await Promise.all([
      supabaseAdmin
        .from("portal_api_keys")
        .select("key_prefix, status, last_used_at")
        .eq("organization_id", organizationId)
        .eq("portal", "properstar")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("site_feed_access_logs")
        .select("created_at, items, status")
        .eq("organization_id", organizationId)
        .eq("endpoint", "portal.properstar.feed")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const key = keys?.[0] ?? null;
    const log = logs?.[0] ?? null;

    return {
      organizationId,
      feedUrlTemplate: `${CRM_URL}${properstarFeedPath(key?.key_prefix ? "<cheia-agenției>" : "<cheia-agenției>")}`,
      hasActiveKey: Boolean(key),
      keyPrefix: key?.key_prefix ?? null,
      selected: build.selected,
      active: build.active,
      deleted: build.deleted,
      excluded: build.excluded,
      lastFetchAt: log?.created_at ?? null,
      lastFetchItems: log?.items ?? null,
    };
  });
