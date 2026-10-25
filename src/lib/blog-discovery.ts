import { INTEGRATION_PAGES, INTEGRATION_PAGES_LASTMOD } from "@/lib/portals/integration-pages";
import type { BlogStatus } from "@/lib/blog";
import { PLAN_KEYS, PLAN_LABELS, PLAN_PRICES, planAgentLimitLabel } from "@/lib/plans";
import { marketSourceName } from "@/lib/market/sources";
import { SITE_NAME, LEGAL_NAME, COMPANY_TAX_ID, COMPANY_REGISTER_ID, FACEBOOK_URL, GOOGLE_PROFILE_URL } from "@/components/marketing/public-identity";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/components/marketing/structured-data";

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
  "/anunturi-proprietari": "2026-10-25",
  "/preturi": "2026-10-04",
  "/despre": "2026-09-27",
  "/contact": "2026-09-27",
  "/integrari": "2026-10-18",
  "/intrebari-frecvente": "2026-10-10",
  "/termeni": "2026-10-05",
  "/politica-de-confidentialitate": "2026-09-27",
};

const publicPages = ["/", "/functionalitati", "/anunturi-proprietari", "/preturi", "/despre", "/contact", "/integrari", "/intrebari-frecvente", "/blog", "/termeni", "/politica-de-confidentialitate"];

const integrationPaths = INTEGRATION_PAGES.map((p) => `/integrari/${p.slug}`);

function urlXml(path: string, lastmod: string | null) {
  return `  <url>\n    <loc>${escapeXml(`${BLOG_SITE_URL}${path}`)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}\n  </url>`;
}

function latestPostDate(posts: DiscoverableBlogPost[], now: Date) {
  const times = selectDiscoverablePosts(posts, now).map((p) => new Date(p.updated_at).getTime());
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

export function buildStaticSitemapXml(hasPartners = false, posts: DiscoverableBlogPost[] = [], now = new Date()) {
  const pages = [...publicPages, ...(hasPartners ? ["/agentii"] : []), ...integrationPaths];
  const urls = pages.map((path) =>
    urlXml(path, path === "/blog" ? latestPostDate(posts, now) : (PAGE_LASTMOD[path] ?? (path.startsWith("/integrari/") ? INTEGRATION_PAGES_LASTMOD : null))),
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

export type LlmsStatistics = {
  owner_sources: { source: string; count: number }[];
  market_active: number;
};

export function buildLlmsTxt(posts: DiscoverableBlogPost[], now: Date, hasPartners: boolean, statistics: LlmsStatistics) {
  const articles = selectDiscoverablePosts(posts, now);
  const blogLines = articles.length
    ? articles.map((post) => `- [${post.title}](${BLOG_SITE_URL}/blog/${post.slug}): ${post.excerpt.replace(/\s+/g, " ").trim()}`).join("\n")
    : "- Nu există încă articole publicate.";
  const sources = statistics.owner_sources.filter((row) => row.count > 0);
  const total = sources.reduce((sum, row) => sum + row.count, 0);
  const today = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" }).format(now);
  const portalLinks = INTEGRATION_PAGES.map((page) => `- [Integrare ${page.name}](${BLOG_SITE_URL}/integrari/${page.slug}): ${page.description}`).join("\n");
  const prices = PLAN_KEYS.map((key) => {
    const price = PLAN_PRICES[key];
    const discount = Math.round((1 - price.annualMonthly / price.monthly) * 100);
    return `- ${PLAN_LABELS[key]}: ${price.monthly} €/lună, ${planAgentLimitLabel(key)}; plata anuală: ${price.annualMonthly * 12} €/an (${price.annualMonthly} €/lună echivalent), reducere ${discount}%.`;
  }).join("\n");
  return `# ${SITE_NAME}
> Habitoo CRM este un CRM imobiliar în limba română pentru agențiile și agenții imobiliari din România. Reunește proprietățile, clienții, cererile, lead-urile și echipa, publică anunțurile pe portalurile imobiliare și adună anunțurile de la proprietari din mai multe portaluri.

## Pagini principale
- [Habitoo CRM — prima pagină](${BLOG_SITE_URL}/): CRM imobiliar pentru agențiile din România.
- [Funcționalități Habitoo CRM](${BLOG_SITE_URL}/functionalitati): Proprietăți, clienți, cereri, lead-uri și activitatea echipei.
- [Anunțuri de la proprietari pentru agenții imobiliare](${BLOG_SITE_URL}/anunturi-proprietari): Surse, cifre live, filtre pe zone și import în portofoliu cu acordul proprietarului.
- [Prețuri și planuri de acces](${BLOG_SITE_URL}/preturi): Basic, Pro și Unlimited, abonamente lunare și anuale.
- [Integrări și publicare pe portaluri](${BLOG_SITE_URL}/integrari): Portalurile și serviciile conectate la Habitoo.
${portalLinks}
- [Întrebări frecvente despre Habitoo CRM](${BLOG_SITE_URL}/intrebari-frecvente): Răspunsuri despre acces, funcționalități și abonamente.
- [Despre Habitoo CRM](${BLOG_SITE_URL}/despre): Platforma și compania operatoare.
- [Contact și asistență Habitoo](${BLOG_SITE_URL}/contact): Date de contact și solicitări.
- [Blog imobiliar Habitoo](${BLOG_SITE_URL}/blog): Articole pentru agenții și agenții imobiliari.
${hasPartners ? `- [Agenții partenere Habitoo](${BLOG_SITE_URL}/agentii): Agențiile imobiliare partenere din România.\n` : ""}
## Ce face Habitoo
- Proprietăți: fișă completă, galerie foto, statusuri, vizionări programate
- Clienți, cereri și lead-uri, cu pipeline în 9 etape
- Potrivire automată între cereri și proprietăți, cu scor și motive
- Publicare pe portaluri: Imobiliare.ro, Storia și OLX, Publi24 (prin Romimo), iMove, Imospot, HomePitch, PrimulAnunț, LaCheie, ClickImob, Properstar și Catalogul Facebook (Meta)
- Anunțuri de la proprietari: adunate automat din Storia, OLX, Romimo, Imoradar24 și Anuntul.ro, cu filtre pe județ, oraș și zone; importul în portofoliu se face doar după confirmarea acordului proprietarului
- Analiză comparativă de piață (ACP) din ofertele active
- Colaborare între agenții (de tip MLS), cu comision stabilit
- Contracte digitale cu semnătură
- Comisioane: agentul își vede comisioanele, adminul toată agenția, cu rapoarte, comparații și export
- Calendar, activități, obiective, rapoarte, roluri și jurnal de audit

## Cifre (generate automat)
- La ${today}, Habitoo avea ${total} anunțuri active de la proprietari, din ${sources.length} surse: ${sources.map((row) => `${marketSourceName(row.source)} (${row.count})`).join(", ") || "niciuna"}.
- ${statistics.market_active} oferte de piață active folosite în analizele comparative.

## Ce nu face Habitoo
- Nu are încă aplicație mobilă nativă; funcționează în browser pe telefon, tabletă și calculator.
- Analiza comparativă folosește prețurile cerute în anunțuri, nu prețurile de tranzacție.
- La majoritatea anunțurilor de la proprietari nu se afișează telefonul.
- Anunțurile de la proprietari care nu mai sunt actualizate dispar după 60 de zile.
- Importul unui anunț în portofoliu nu publică nimic automat.
- Integrarea Argus necesită abonamentul Argus propriu al agenției.

## Prețuri și acces
${prices}
- Perioadă gratuită de 90 de zile, fără card.

## Companie
- Brand: ${SITE_NAME}
- Operator: ${LEGAL_NAME}, CUI ${COMPANY_TAX_ID}, Registrul Comerțului ${COMPANY_REGISTER_ID}
- Sediu: Dudu, comuna Chiajna, județul Ilfov, România
- Contact: ${CONTACT_EMAIL}, ${CONTACT_PHONE_DISPLAY}
- Site: ${BLOG_SITE_URL}
- Facebook: ${FACEBOOK_URL}
- Google: ${GOOGLE_PROFILE_URL}
- Piață: România - agenții imobiliare și agenți imobiliari

## Blog
${blogLines}

## Descriere scurtă
- RO: Habitoo CRM este un CRM imobiliar pentru agențiile din România, cu proprietăți, clienți, cereri, lead-uri, potrivire automată, publicare pe portaluri, anunțuri de la proprietari și analiză comparativă de piață.
- EN: Habitoo CRM is a Romanian-language real estate CRM for agencies in Romania: properties, clients, requests, leads, automatic matching, multi-portal publishing, owner listings and comparative market analysis.
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