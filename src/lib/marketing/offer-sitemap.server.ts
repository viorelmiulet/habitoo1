import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publicRead } from "@/lib/public-read";
import { OFFER_SITEMAP_PAGE_SIZE } from "./offer-seo";

function publicDb() {
  const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  } } });
}
export function loadOfferSitemapCount(): Promise<number> {
  return publicRead("public_offer_sitemap_count", async () => {
    const { data, error } = await publicDb().rpc("public_offer_sitemap_count");
    if (error) throw new Error("Numărul ofertelor nu a putut fi citit.");
    return Number(data ?? 0);
  }, 0);
}
export function loadOfferSitemapPage(page: number): Promise<{ slug: string; lastmod: string | null }[]> {
  return publicRead("public_offer_sitemap", async () => {
    const { data, error } = await publicDb().rpc("public_offer_sitemap", { _offset: (page - 1) * OFFER_SITEMAP_PAGE_SIZE, _limit: OFFER_SITEMAP_PAGE_SIZE });
    if (error) throw new Error("Ofertele nu au putut fi citite.");
    return (data ?? []).map(r => ({ slug: r.slug, lastmod: r.lastmod }));
  }, []);
}
