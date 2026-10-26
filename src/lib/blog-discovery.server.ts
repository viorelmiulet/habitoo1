import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DiscoverableBlogPost, LlmsStatistics } from "@/lib/blog-discovery";
import { publicRead } from "@/lib/public-read";

/** Only aggregate counts are public; individual listings keep their existing access rules. */
/** Null când citirea eșuează sau expiră: paginile se afișează fără cifre. */
export function loadLlmsStatistics(): Promise<LlmsStatistics | null> {
  return publicRead("public_llms_statistics", readLlmsStatistics, null);
}

async function readLlmsStatistics(): Promise<LlmsStatistics> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error("Configurația publică lipsește.");
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
      headers.set('apikey', key);
      return fetch(input, { ...init, headers });
    } },
  });
  const { data, error } = await db.rpc("public_llms_statistics");
  if (error) throw new Error("Cifrele publice nu au putut fi încărcate.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Cifre publice invalide.");
  const sources = data['owner_sources'];
  const market = data['market_active'];
  if (!Array.isArray(sources) || typeof market !== "number" || !Number.isSafeInteger(market) || market < 0) throw new Error("Cifre publice invalide.");
  const owner_sources = sources.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row['source'] !== "string" || typeof row['count'] !== "number" || !Number.isSafeInteger(row['count']) || row['count'] < 0) throw new Error("Cifre publice invalide.");
    return { source: row['source'], count: row['count'] };
  });
  return { owner_sources, market_active: market };
}

export function loadDiscoverableBlogPosts(limit?: number): Promise<DiscoverableBlogPost[]> {
  return publicRead("blog_posts", () => readDiscoverableBlogPosts(limit), []);
}

async function readDiscoverableBlogPosts(limit?: number): Promise<DiscoverableBlogPost[]> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error("Configurația blogului public lipsește.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const pageSize = limit ? Math.min(limit, 1000) : 1000;
  const rows: DiscoverableBlogPost[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = db
      .from("blog_posts")
      .select("slug,title,excerpt,status,published_at,updated_at")
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as DiscoverableBlogPost[];
    rows.push(...batch);
    if (limit || batch.length < pageSize) break;
  }
  return rows;
}