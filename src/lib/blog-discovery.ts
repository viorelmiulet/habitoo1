import type { BlogStatus } from "@/lib/blog";

export const BLOG_SITE_URL = "https://www.habitoo.ro";

export type DiscoverableBlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  status: BlogStatus;
  published_at: string | null;
  updated_at: string;
};

export function selectDiscoverablePosts(posts: DiscoverableBlogPost[], now = new Date()) {
  const cutoff = now.getTime();
  return posts.filter((post) =>
    post.status === "published" &&
    post.published_at !== null &&
    new Date(post.published_at).getTime() <= cutoff,
  );
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Data ultimei modificări reale a fiecărei pagini (conținutul paginii, nu build-ul).
 * Actualizează valoarea când schimbi conținutul paginii respective.
 * `/blog` folosește data celui mai recent articol modificat.
 */
export const PAGE_LASTMOD: Record<string, string> = {
  "/": "2026-10-10",
  "/functionalitati": "2026-10-10",
  "/preturi": "2026-10-04",
  "/despre": "2026-09-27",
  "/contact": "2026-09-27",
  "/integrari": "2026-10-10",
  "/termeni": "2026-10-05",
  "/politica-de-confidentialitate": "2026-09-27",
};

const publicPages = ["/", "/functionalitati", "/preturi", "/despre", "/contact", "/integrari", "/blog", "/termeni", "/politica-de-confidentialitate"];

function urlXml(path: string, lastmod: string | null) {
  return `  <url>\n    <loc>${escapeXml(`${BLOG_SITE_URL}${path}`)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}\n  </url>`;
}

function latestPostDate(posts: DiscoverableBlogPost[], now: Date) {
  const times = selectDiscoverablePosts(posts, now).map((p) => new Date(p.updated_at).getTime());
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

export function buildStaticSitemapXml(hasPartners = false, posts: DiscoverableBlogPost[] = [], now = new Date()) {
  const pages = hasPartners ? [...publicPages, "/agentii"] : publicPages;
  const urls = pages.map((path) =>
    urlXml(path, path === "/blog" ? latestPostDate(posts, now) : (PAGE_LASTMOD[path] ?? null)),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function buildBlogSitemapXml(posts: DiscoverableBlogPost[], now = new Date()) {
  const urls = selectDiscoverablePosts(posts, now).map((post) =>
    urlXml(`/blog/${post.slug}`, new Date(post.updated_at).toISOString()),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function buildSitemapIndexXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${BLOG_SITE_URL}/sitemap-pages.xml</loc></sitemap>\n  <sitemap><loc>${BLOG_SITE_URL}/sitemap-blog.xml</loc></sitemap>\n</sitemapindex>\n`;
}

export function buildSitemapXml(posts: DiscoverableBlogPost[], now = new Date(), hasPartners = false) {
  const articles = selectDiscoverablePosts(posts, now);
  if (articles.length > 500) return buildSitemapIndexXml();
  const staticXml = buildStaticSitemapXml(hasPartners, posts, now).replace(/^<\?xml[^>]+>\n|<urlset[^>]+>\n|\n<\/urlset>\n$/g, "");
  const blogXml = buildBlogSitemapXml(articles, now).replace(/^<\?xml[^>]+>\n|<urlset[^>]+>\n|\n<\/urlset>\n$/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticXml}${blogXml ? `\n${blogXml}` : ""}\n</urlset>\n`;
}

export function buildLlmsTxt(posts: DiscoverableBlogPost[], now = new Date(), hasPartners = false) {
  const articles = selectDiscoverablePosts(posts, now);
  const blogLines = articles.length
    ? articles.map((post) => `- [${post.title}](${BLOG_SITE_URL}/blog/${post.slug}): ${post.excerpt.replace(/\s+/g, " ").trim()}`).join("\n")
    : "- Nu există încă articole publicate.";
  return `# Habitoo CRM

Habitoo CRM este o platformă în limba română pentru organizarea activității unei agenții imobiliare. Reunește proprietățile, clienții, cererile și activitățile echipei într-un singur spațiu de lucru.

## Blog

${blogLines}

## Pagini principale

- [Pagina principală](${BLOG_SITE_URL}/)
- [Prețuri](${BLOG_SITE_URL}/preturi)
- [Contact](${BLOG_SITE_URL}/contact)
${hasPartners ? `- [Agenții partenere](${BLOG_SITE_URL}/agentii)\n` : ""}`;
}

export function buildRssXml(posts: DiscoverableBlogPost[], now = new Date()) {
  const articles = selectDiscoverablePosts(posts, now).slice(0, 20);
  const items = articles.map((post) => {
    const link = `${BLOG_SITE_URL}/blog/${post.slug}`;
    return `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${escapeXml(link)}</link>\n      <guid isPermaLink="true">${escapeXml(link)}</guid>\n      <pubDate>${new Date(post.published_at ?? post.updated_at).toUTCString()}</pubDate>\n      <description>${escapeXml(post.excerpt)}</description>\n    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Blog Habitoo</title>\n    <link>${BLOG_SITE_URL}/blog</link>\n    <description>Sfaturi practice pentru agenții imobiliare.</description>\n    <language>ro-RO</language>\n    ${items.join("\n") }\n  </channel>\n</rss>\n`;
}