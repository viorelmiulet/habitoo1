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
  /** Portalul Properstar e activat pentru agenție (singura condiție de intrare în feed). */
  activated: boolean;
  selected: number;
  active: number;
  deleted: number;
  excluded: ProperstarReportItem[];
  /** Incluse cu codul poștal al agenției; fișa ofertei rămâne fără cod. */
  agencyPostalUsed: ProperstarReportItem[];
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
    const { buildProperstarFeed, PROPERSTAR_FEED_PATH_PREFIX } = await import(
      "@/lib/portals/properstar/feed.server"
    );
    const { CRM_URL } = await import("@/lib/host");

    // Doar bază pentru linkurile din feed; nu conține nicio cheie. Feedul
    // Properstar nu mai are cale pe cheie de agenție (model retras).
    const build = await buildProperstarFeed({
      organizationId,
      requestUrl: `${CRM_URL}${PROPERSTAR_FEED_PATH_PREFIX}`,
    });

    const [{ data: connection }, { data: logs }] = await Promise.all([
      supabaseAdmin
        .from("portal_connections")
        .select("activated")
        .eq("organization_id", organizationId)
        .eq("portal", "properstar")
        .maybeSingle(),
      supabaseAdmin
        .from("site_feed_access_logs")
        .select("created_at, items, status")
        .eq("organization_id", organizationId)
        .eq("endpoint", "portal.properstar.agency_feed")
        .eq("status", 200)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const log = logs?.[0] ?? null;

    return {
      organizationId,
      activated: connection?.activated === true,
      selected: build.selected,
      active: build.active,
      deleted: build.deleted,
      excluded: build.excluded,
      agencyPostalUsed: build.agencyPostalUsed,
      lastFetchAt: log?.created_at ?? null,
      lastFetchItems: log?.items ?? null,
    };
  });

/**
 * Golește cache-ul feedului pentru agenția din sesiune. Se apelează din orice
 * ecran care schimbă ceva ce apare în feed; agenția nu vine niciodată din input.
 */
export const properstarFeedChanged = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const organizationId = await organizationOf(context as unknown as AuthContext);
    const { clearProperstarCache } = await import("./properstar/cache");
    clearProperstarCache(organizationId);
    return { ok: true };
  });
