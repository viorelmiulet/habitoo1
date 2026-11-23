import { readFeedImages } from "@/lib/site-feed/complete-read.server";
import { errorResponse, type FeedAuthOk } from "@/lib/site-feed/auth.server";
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { buildFacebookCombinedCsv, buildFacebookProductsCsv, exclusionDetail } from "@/lib/site-feed/facebook-catalog";
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
  const products = new URL(request.url).searchParams.get("format") === "products";
  const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", auth.organizationId)
      .maybeSingle();
  const brand = org?.name ?? "";
  const result = products
    ? buildFacebookProductsCsv({ properties, imagesByProperty, baseUrl, publicSiteUrl, brand })
    : buildFacebookCombinedCsv({ properties, imagesByProperty, baseUrl, publicSiteUrl, brand });

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
    detail: products ? `format=products;${exclusionDetail(result)}` : exclusionDetail(result),
  };
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Aceeași selecție ca feed-ul (publicate, nesterse, statusuri publice) + pozele publicabile. */
export async function loadFacebookCatalogInput(
  supabaseAdmin: AdminClient,
  organizationId: string,
  includeProperties = true,
  onlyPropertyIds?: string[],
  /** true (implicit) = doar anunțurile cu opt-in în Catalogul Facebook. */
  requireOptIn = true,
): Promise<{ properties: PropertyRow[]; imagesByProperty: Map<string, PropertyImageRow[]> }> {
  const properties: PropertyRow[] = [];
  if (includeProperties) {
    for (let from = 0; ; from += PAGE) {
      let query = supabaseAdmin
        .from("properties")
        .select("*")
        .eq("organization_id", organizationId);
      if (onlyPropertyIds) query = query.in("id", onlyPropertyIds);
      const { data, error } = await query
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

  if (requireOptIn && properties.length > 0) {
    const { optedInPropertyIds } = await import("@/lib/site-feed/facebook-catalog-optin.server");
    const opted = await optedInPropertyIds(supabaseAdmin, organizationId);
    for (let i = properties.length - 1; i >= 0; i--) {
      if (!opted.has(properties[i]!.id)) properties.splice(i, 1);
    }
  }

  const imagesByProperty = new Map<string, PropertyImageRow[]>();
  const ids = properties.map((p) => p.id);
  {
    const { data } = await readFeedImages<PropertyImageRow>(supabaseAdmin, organizationId, ids);
    for (const img of data) {
      const list = imagesByProperty.get(img.property_id) ?? [];
      list.push(img);
      imagesByProperty.set(img.property_id, list);
    }
  }

  return { properties, imagesByProperty };
}
