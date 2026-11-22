/** Browser-safe SEO helpers for public agency (/agentii/{slug}) pages; former agent pages redirect to the agency. Slugs mirror the database generators. */
import { OFFER_SITE, offerAbsoluteUrl, slugPart } from "./offer-seo";

export const PROFILE_OFFERS_PAGE_SIZE = 24;
export const agencyPath = (slug: string) => `/agentii/${slug}`;
export const agentPath = (agencySlug: string, agentSlug: string) => `/agentii/${agencySlug}/${agentSlug}`;
export const profileUrl = (path: string) => `${OFFER_SITE}${path}`;

/** Agency slug: name, then name-city when taken, then a short id suffix. */
export function agencySlug(input: { id: string; name: string; city: string | null }, taken: Set<string>): string {
  const base = slugPart(input.name).slice(0, 80) || "agentie";
  if (!taken.has(base)) return base;
  const city = slugPart(input.city);
  const withCity = city ? `${base}-${city}` : base;
  return taken.has(withCity) ? `${base}-${input.id.replace(/-/g, "").slice(0, 6)}` : withCity;
}
/** Agent slug unique within the agency: name, name-2, name-3… */
export function agentSlug(name: string, takenInAgency: Set<string>): string {
  const base = slugPart(name).slice(0, 80) || "agent";
  let s = base;
  for (let n = 2; takenInAgency.has(s); n++) s = `${base}-${n}`;
  return s;
}

export function agencyIndexable(a: { currentAccess: boolean; offerCount: number }) { return a.currentAccess && a.offerCount > 0; }

/** Lists each offer once: copies are dropped when their original is also present. */
export function dedupeOffers<T extends { slug: string; originalSlug?: string | null }>(rows: T[]): T[] {
  const slugs = new Set(rows.map(r => r.slug)); const seen = new Set<string>();
  return rows.filter(r => !(r.originalSlug && slugs.has(r.originalSlug)) && !seen.has(r.slug) && (seen.add(r.slug), true));
}

type Ld = Record<string, unknown>;
const itemList = (url: string, offers: { slug: string; title: string }[], offset: number): Ld => ({
  "@type": "ItemList", "@id": `${url}#oferte`, name: "Oferte", numberOfItems: offers.length,
  itemListElement: offers.map((o, i) => ({ "@type": "ListItem", position: offset + i + 1, url: offerAbsoluteUrl(o.slug), name: o.title })),
});
const crumbs = (items: { name: string; url: string }[]): Ld => ({
  "@type": "BreadcrumbList", "@id": `${items[items.length - 1]!.url}#breadcrumb`,
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
});
const agencyCrumbs = (name: string, slug: string) => [{ name: "Acasă", url: `${OFFER_SITE}/` }, { name: "Agenții", url: `${OFFER_SITE}/agentii` }, { name, url: profileUrl(agencyPath(slug)) }];

export function agencyJsonLd(a: { name: string; slug: string; description: string | null; logoUrl: string | null; city: string | null; phone: string | null; email: string | null; website: string | null }, offers: { slug: string; title: string }[], offset = 0): Ld[] {
  const url = profileUrl(agencyPath(a.slug));
  return [
    { "@type": "RealEstateAgent", "@id": `${url}#agency`, name: a.name, url, ...(a.description ? { description: a.description } : {}),
      ...(a.logoUrl ? { logo: `${OFFER_SITE}${a.logoUrl}`, image: `${OFFER_SITE}${a.logoUrl}` } : {}), ...(a.phone ? { telephone: a.phone } : {}), ...(a.email ? { email: a.email } : {}),
      ...(a.website ? { sameAs: [a.website] } : {}), ...(a.city ? { address: { "@type": "PostalAddress", addressLocality: a.city, addressCountry: "RO" } } : {}) },
    itemList(url, offers, offset),
    crumbs(agencyCrumbs(a.name, a.slug)),
  ];
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const AGENCY_SITEMAP_URL = `${OFFER_SITE}/sitemap-agentii.xml`;
export function buildAgencySitemapXml(rows: { path: string; lastmod: string | null }[]) {
  const urls = rows.map(r => `  <url><loc>${esc(profileUrl(r.path))}</loc>${r.lastmod ? `<lastmod>${new Date(r.lastmod).toISOString()}</lastmod>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
