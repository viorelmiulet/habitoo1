import type { LinkHTMLAttributes } from "react";
import { SITE_URL, SITE_NAME } from "./public-identity";
import { publicGraphJsonLd } from "./structured-data";

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
  ogImage = OG_IMAGE_URL,
  preloadImage,
  jsonLd,
  noindex,
}: PublicHeadOptions) {
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
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
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:image", content: ogImage },
  ];
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
            children: JSON.stringify(publicGraphJsonLd(jsonLd)),
          },
        ],
  };
}
