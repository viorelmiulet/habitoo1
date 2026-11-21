/** Browser-safe SEO helpers for public offer pages (/oferta/{slug}). Mirrors public.offer_slug in the database. */
export const OFFER_SITE = "https://www.habitoo.ro";
export const OFFER_SITEMAP_PAGE_SIZE = 45000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

const TYPE_WORDS: Record<string, string> = {
  apartment: "apartament", studio: "garsoniera", house: "casa", villa: "vila", land: "teren", commercial: "spatiu-comercial",
  office: "birou", industrial: "spatiu-industrial", penthouse: "penthouse", duplex: "duplex",
};
export function slugPart(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[şș]/g, "s").replace(/[ţț]/g, "t")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export type SlugInput = { propertyType: string | null; rooms: number | null; district: string | null; city: string | null; reference: string };
export function offerSlug(input: SlugInput, max = 90): string {
  const type = TYPE_WORDS[(input.propertyType ?? "").toLowerCase()] ?? slugPart(input.propertyType);
  let prefix = type;
  if (input.rooms && input.rooms > 0 && type !== "garsoniera" && type !== "teren") prefix = [prefix, `${input.rooms}-${input.rooms === 1 ? "camera" : "camere"}`].filter(Boolean).join("-");
  let zone = slugPart(input.district); let city = slugPart(input.city);
  if (zone === city) zone = "";
  const tail = slugPart(input.reference);
  const trim = (s: string, over: number) => s.slice(0, Math.max(s.length - over, 0)).replace(/^-+|-+$/g, "");
  for (;;) {
    const s = [prefix, zone, city, tail].filter(Boolean).join("-");
    if (s.length <= max) return s;
    const over = s.length - max;
    if (zone) zone = trim(zone, over); else if (city) city = trim(city, over); else if (prefix) prefix = trim(prefix, over); else return tail.slice(-max);
  }
}
export const offerPath = (slug: string) => `/oferta/${slug}`;
export const offerAbsoluteUrl = (slug: string) => `${OFFER_SITE}${offerPath(slug)}`;

export type OfferEligibility = { publishStatus: string; status: string; deletedAt: string | null; archivedAt: string | null; agencyHidden: boolean; slug: string | null };
export function isOfferIndexable(o: OfferEligibility): boolean {
  return Boolean(o.slug) && o.publishStatus === "published" && !o.deletedAt && !o.archivedAt && ["active", "reserved", "negotiation"].includes(o.status) && !o.agencyHidden;
}
/** Copies of development units point at the eligible original; otherwise at themselves. */
export function offerCanonicalUrl(ownSlug: string, original: OfferEligibility | null): string {
  return original && isOfferIndexable(original) ? offerAbsoluteUrl(original.slug!) : offerAbsoluteUrl(ownSlug);
}

type LdOffer = { slug: string; title: string; description: string | null; price: number | null; currency: string; transactionKind: string; city: string | null; county: string | null; district: string | null; agencyName: string | null; image: string | null; updatedAt: string };
export function offerJsonLd(o: LdOffer) {
  const url = offerAbsoluteUrl(o.slug);
  const listing: Record<string, unknown> = {
    "@type": "RealEstateListing", "@id": `${url}#listing`, url, name: o.title, inLanguage: "ro", dateModified: o.updatedAt,
    ...(o.description ? { description: o.description.slice(0, 500) } : {}), ...(o.image ? { image: o.image } : {}),
    contentLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "RO", ...(o.city ? { addressLocality: o.city } : {}), ...(o.county ? { addressRegion: o.county } : {}) } },
    offers: {
      "@type": "Offer", "@id": `${url}#offer`, url, businessFunction: o.transactionKind === "rent" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell",
      availability: "https://schema.org/InStock", ...(o.price ? { price: o.price, priceCurrency: o.currency } : {}),
      ...(o.agencyName ? { offeredBy: { "@type": "RealEstateAgent", name: o.agencyName } } : {}),
    },
  };
  const breadcrumb = { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
    { "@type": "ListItem", position: 1, name: "Acasă", item: `${OFFER_SITE}/` },
    ...(o.city ? [{ "@type": "ListItem", position: 2, name: o.city }] : []),
    { "@type": "ListItem", position: o.city ? 3 : 2, name: o.title, item: url },
  ] };
  return [listing, breadcrumb];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function offerSitemapPageUrl(page: number) { return `${OFFER_SITE}/sitemap-oferte.xml${page > 1 ? `?pagina=${page}` : ""}`; }
export function offerSitemapPages(total: number) { return Math.max(1, Math.ceil(total / OFFER_SITEMAP_PAGE_SIZE)); }
export function buildOfferSitemapXml(rows: { slug: string; lastmod: string | null }[]) {
  const urls = rows.map(r => `  <url><loc>${esc(offerAbsoluteUrl(r.slug))}</loc>${r.lastmod ? `<lastmod>${new Date(r.lastmod).toISOString()}</lastmod>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
export function buildRootSitemapIndexXml(offerTotal: number) {
  const locs = [`${OFFER_SITE}/sitemap-pages.xml`, `${OFFER_SITE}/sitemap-blog.xml`, `${OFFER_SITE}/sitemap-agentii.xml`, ...Array.from({ length: offerSitemapPages(offerTotal) }, (_, i) => offerSitemapPageUrl(i + 1))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map(l => `  <sitemap><loc>${esc(l)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}
