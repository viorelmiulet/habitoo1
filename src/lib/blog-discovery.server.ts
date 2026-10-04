import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DiscoverableBlogPost } from "@/lib/blog-discovery";

export async function loadDiscoverableBlogPosts(limit?: number): Promise<DiscoverableBlogPost[]> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error("Configurația blogului public lipsește.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let query = db
    .from("blog_posts")
    .select("slug,title,excerpt,status,published_at,updated_at")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as DiscoverableBlogPost[];
}