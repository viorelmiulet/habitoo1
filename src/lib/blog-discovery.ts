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

const publicPages = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/functionalitati", changefreq: "monthly", priority: "0.8" },
  { path: "/preturi", changefreq: "monthly", priority: "0.8" },
  { path: "/despre", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
  { path: "/integrari", changefreq: "monthly", priority: "0.7" },
  { path: "/blog", changefreq: "weekly", priority: "0.9" },
  { path: "/termeni", changefreq: "yearly", priority: "0.3" },
  { path: "/politica-de-confidentialitate", changefreq: "yearly", priority: "0.3" },
] as const;

export function buildStaticSitemapXml() {
  const urls = publicPages.map(({ path, changefreq, priority }) =>
    `  <url>\n    <loc>${escapeXml(`${BLOG_SITE_URL}${path}`)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function buildBlogSitemapXml(posts: DiscoverableBlogPost[], now = new Date()) {
  const urls = selectDiscoverablePosts(posts, now).map((post) =>
    `  <url>\n    <loc>${escapeXml(`${BLOG_SITE_URL}/blog/${post.slug}`)}</loc>\n    <lastmod>${escapeXml(new Date(post.updated_at).toISOString())}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function buildSitemapIndexXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${BLOG_SITE_URL}/sitemap-pages.xml</loc></sitemap>\n  <sitemap><loc>${BLOG_SITE_URL}/sitemap-blog.xml</loc></sitemap>\n</sitemapindex>\n`;
}

export function buildSitemapXml(posts: DiscoverableBlogPost[], now = new Date()) {
  const articles = selectDiscoverablePosts(posts, now);
  if (articles.length > 500) return buildSitemapIndexXml();
  const staticXml = buildStaticSitemapXml().replace(/^<\?xml[^>]+>\n|<urlset[^>]+>\n|\n<\/urlset>\n$/g, "");
  const blogXml = buildBlogSitemapXml(articles, now).replace(/^<\?xml[^>]+>\n|<urlset[^>]+>\n|\n<\/urlset>\n$/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticXml}${blogXml ? `\n${blogXml}` : ""}\n</urlset>\n`;
}

export function buildLlmsTxt(posts: DiscoverableBlogPost[], now = new Date()) {
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
`;
}

export function buildRssXml(posts: DiscoverableBlogPost[], now = new Date()) {
  const articles = selectDiscoverablePosts(posts, now).slice(0, 20);
  const items = articles.map((post) => {
    const link = `${BLOG_SITE_URL}/blog/${post.slug}`;
    return `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${escapeXml(link)}</link>\n      <guid isPermaLink="true">${escapeXml(link)}</guid>\n      <pubDate>${new Date(post.published_at ?? post.updated_at).toUTCString()}</pubDate>\n      <description>${escapeXml(post.excerpt)}</description>\n    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Blog Habitoo</title>\n    <link>${BLOG_SITE_URL}/blog</link>\n    <description>Sfaturi practice pentru agenții imobiliare.</description>\n    <language>ro-RO</language>\n    ${items.join("\n") }\n  </channel>\n</rss>\n`;
}