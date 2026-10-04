import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SITE = "https://www.habitoo.ro";
const pages = ["", "/functionalitati", "/preturi", "/despre", "/contact", "/integrari", "/blog", "/termeni", "/politica-de-confidentialitate"];
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const Route = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: async () => {
  const db = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.from("blog_posts").select("slug,updated_at").eq("status", "published").lte("published_at", new Date().toISOString()).order("published_at", { ascending: false });
  const urls = [...pages.map((path) => ({ loc: `${SITE}${path || "/"}`, lastmod: null as string | null })), ...(data ?? []).map((post) => ({ loc: `${SITE}/blog/${post.slug}`, lastmod: post.updated_at }))];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url>\n    <loc>${esc(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${new Date(url.lastmod).toISOString()}</lastmod>` : ""}\n  </url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" } });
} } } });
