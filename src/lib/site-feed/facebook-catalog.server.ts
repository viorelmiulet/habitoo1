import { errorResponse, type FeedAuthOk } from "@/lib/site-feed/auth.server";
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { buildFacebookCatalogCsv, exclusionDetail } from "@/lib/site-feed/facebook-catalog";
import {
  FEED_PUBLIC_STATUSES,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

const PAGE = 1000;

export async function handleFacebookCatalog(
  request: Request,
  auth: FeedAuthOk,
): Promise<{ response: Response; items?: number; detail?: string | null }> {
  if (!auth.scopes.includes("feed:read")) {
    return { response: errorResponse(403, "Missing scope: feed:read"), items: 0 };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { properties, imagesByProperty } = await loadFacebookCatalogInput(
    supabaseAdmin,
    auth.organizationId,
    auth.indexStatus !== "grace",
  );

  const { baseUrl, publicSiteUrl } = feedUrlsForRequest(new URL(request.url));
  const result = buildFacebookCatalogCsv({ properties, imagesByProperty, baseUrl, publicSiteUrl });

  return {
    response: new Response(result.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "private, max-age=300",
        "x-habitoo-included": String(result.included),
        "x-habitoo-excluded": String(result.excludedTotal),
      },
    }),
    items: result.included,
    detail: exclusionDetail(result),
  };
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Aceeași selecție ca feed-ul (publicate, nesterse, statusuri publice) + pozele publicabile. */
export async function loadFacebookCatalogInput(
  supabaseAdmin: AdminClient,
  organizationId: string,
  includeProperties = true,
): Promise<{ properties: PropertyRow[]; imagesByProperty: Map<string, PropertyImageRow[]> }> {
  const properties: PropertyRow[] = [];
  if (includeProperties) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publish_status", "published")
        .is("deleted_at", null)
        .in("status", [...FEED_PUBLIC_STATUSES])
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      properties.push(...((data ?? []) as PropertyRow[]));
      if (!data || data.length < PAGE) break;
    }
  }

  const imagesByProperty = new Map<string, PropertyImageRow[]>();
  const ids = properties.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("property_images")
      .select("*")
      .eq("organization_id", organizationId)
      .in("property_id", ids.slice(i, i + 200))
      .eq("include_in_publish", true)
      .eq("is_confidential", false);
    if (error) throw error;
    for (const img of (data ?? []) as PropertyImageRow[]) {
      const list = imagesByProperty.get(img.property_id) ?? [];
      list.push(img);
      imagesByProperty.set(img.property_id, list);
    }
  }

  return { properties, imagesByProperty };
}
