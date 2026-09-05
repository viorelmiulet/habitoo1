import type { LinkHTMLAttributes } from "react";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap";

/**
 * Head pentru rutele autentificate (CRM / Superadmin): titlu, noindex și
 * fonturile brand (aceleași ca pe site-ul public, încărcate separat).
 */
export function appHead(title: string) {
  const links: Array<LinkHTMLAttributes<HTMLLinkElement>> = [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: FONTS_HREF },
  ];
  return {
    meta: [{ title }, { name: "robots", content: "noindex, nofollow" }],
    links,
  };
}
