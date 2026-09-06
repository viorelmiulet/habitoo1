import type { LinkHTMLAttributes } from "react";

export const SITE_URL = "https://www.habitoo.ro";
export const SITE_NAME = "Habitoo CRM";
export const OG_IMAGE_URL = `${SITE_URL}/assets/og-cover.jpg`;

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap";

type PublicHeadOptions = {
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
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
    { property: "og:image", content: OG_IMAGE_URL },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:image", content: OG_IMAGE_URL },
  ];
  if (noindex) meta.push({ name: "robots", content: "noindex, nofollow" });

  const links: Array<LinkHTMLAttributes<HTMLLinkElement>> = [
    { rel: "canonical", href: url },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: FONTS_HREF },
  ];

  return {
    meta,
    links,
    scripts: jsonLd
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify(jsonLd),
          },
        ]
      : [],
  };
}
