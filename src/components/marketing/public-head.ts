import type { LinkHTMLAttributes } from "react";
import { SITE_URL, SITE_NAME } from "./public-identity";
import { publicGraphJsonLd } from "./structured-data";
import { contentModified } from "@/lib/marketing/content-revisions";
import { FEATURE_PAGES } from "@/lib/marketing/feature-pages";
import { INTEGRATION_PAGES, DYNAMIC_INTEGRATION_PAGES } from "@/lib/portals/integration-pages";

const coverPaths = new Set(["/", "/functionalitati", "/anunturi-proprietari", "/analiza-comparativa-de-piata", "/colaborare-intre-agentii", "/comisioane-agenti-imobiliari", "/import-proprietati", "/preturi", "/despre", "/contact", "/integrari", "/dezvoltatori", "/extensie-chrome", "/intrebari-frecvente", "/blog", "/agentii", "/termeni", "/politica-de-confidentialitate", ...FEATURE_PAGES.map(p=>`/functionalitati/${p.slug}`), ...INTEGRATION_PAGES.map(p=>`/integrari/${p.slug}`), ...DYNAMIC_INTEGRATION_PAGES.map(p=>`/integrari/${p.slug}`)]);

export { SITE_URL, SITE_NAME } from "./public-identity";
export const OG_IMAGE_URL = `${SITE_URL}/assets/og-cover.jpg`;

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Manrope:wght@400;600;700&display=swap";

type PublicHeadOptions = {
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  preloadImage?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
};

/**
 * Head metadata for public (marketing) routes: unique title/description,
 * Open Graph, canonical, brand fonts and optional JSON-LD.
 */
export function publicHead({
  path,
  title,
  description,
  ogTitle,
  ogDescription,
  ogImage: _ogImage,
  preloadImage,
  jsonLd,
  noindex,
}: PublicHeadOptions) {
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  const image = coverPaths.has(path) ? `${SITE_URL}/assets/page-og/${path === "/" ? "home" : path.slice(1).replaceAll("/", "--")}.jpg` : _ogImage;
  const modified = contentModified(path);
  const nodes = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const pageId = `${url}#webpage`;
  const pageNode = { "@type": "WebPage", "@id": pageId, url, name: title, description, inLanguage: "ro", isPartOf: { "@id": `${SITE_URL}/#website` }, ...(modified ? { dateModified: modified } : {}), ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: image } } : {}) };
  const existingPage = nodes.find(node => node["@id"] === pageId);
  const graphNodes = [...nodes.filter(node => node["@id"] !== pageId), { ...pageNode, ...existingPage, ...(modified ? { dateModified: modified } : {}) }];
  const meta: Array<Record<string, string>> = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: ogTitle ?? title },
    { property: "og:description", content: ogDescription ?? description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "ro_RO" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: ogTitle ?? title },
    { name: "twitter:description", content: ogDescription ?? description },
  ];
  if (image) meta.push({ property: "og:image", content: image }, { property: "og:image:alt", content: `${title} — Habitoo CRM` }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }, { name: "twitter:image", content: image }, { name: "twitter:image:alt", content: `${title} — Habitoo CRM` });
  if (noindex) meta.push({ name: "robots", content: "noindex, nofollow" });

  const links: Array<LinkHTMLAttributes<HTMLLinkElement>> = [
    { rel: "canonical", href: url },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: FONTS_HREF },
  ];
  if (preloadImage) links.push({ rel: "preload", as: "image", href: preloadImage, fetchPriority: "high" });

  return {
    meta,
    links,
    scripts: [
          {
            type: "application/ld+json",
            children: JSON.stringify(publicGraphJsonLd(graphNodes)),
          },
        ],
  };
}
