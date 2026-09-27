/**
 * Politica de domenii la marginea serverului (pură, testabilă):
 * - habitoo.ro/* → 301 www.habitoo.ro/*
 * - paginile de prezentare pe crm.* → 301 www.habitoo.ro
 * - robots.txt diferit pe crm.*
 * - X-Robots-Tag: noindex, nofollow pe HTML-ul de pe crm.* (nu pe /api/public, media).
 */
import { PUBLIC_SITE_URL, isCrmHostname } from "./host";

export const APEX_HOST = "habitoo.ro";

/**
 * Paginile site-ului de prezentare (servite doar pe www).
 * `/` NU e în listă: pe crm.* rămâne pe loc (redirecționează către /app),
 * iar pe apex e acoperită de redirectul general către www.
 */
export const MARKETING_PATHS = new Set([
  "/functionalitati",
  "/preturi",
  "/despre",
  "/contact",
  "/termeni",
  "/termeni-si-conditii",
  "/politica-de-confidentialitate",
  "/confidentialitate",
]);

export const CRM_ROBOTS_TXT = "User-agent: *\nDisallow: /\nAllow: /api/public/\n";

/** Fișierul llms.txt — servit DOAR pe www.habitoo.ro. */
export const LLMS_TXT = `# Habitoo CRM

> Habitoo CRM este un CRM imobiliar pentru agențiile din România. Gestionează proprietăți, clienți, cereri și lead-uri, face potrivirea automată între cereri și proprietăți și publică anunțurile pe portalurile imobiliare direct din aplicație.

Informații esențiale:
- Portaluri: Imobiliare.ro, Storia, Publi24 (prin Romimo), iMove, Imospot, HomePitch, PrimulAnunț, OferteImobiliare, LaCheie, ClickImob și, internațional, Properstar.
- Prețuri: Basic 10 €/lună (până la 3 agenți), Pro 20 €/lună (până la 10 agenți), Unlimited 100 €/lună (agenți nelimitați). -50% la plata anuală. 30 de zile gratuite, fără card bancar.
- Colaborare între agenții de tip MLS, import din orice CRM imobiliar, date izolate pentru fiecare agenție.
- Interfață în limba română, în browser, fără instalare. Aplicația mobilă pentru iOS și Android va fi disponibilă în curând.
- Contact: contact@habitoo.ro, telefon/WhatsApp +40 767 941 512.

## Pagini

- [Funcționalități](https://www.habitoo.ro/functionalitati): toate modulele CRM-ului
- [Prețuri](https://www.habitoo.ro/preturi): planuri, perioada gratuită, întrebări frecvente
- [Despre](https://www.habitoo.ro/despre): misiunea și principiile Habitoo
- [Contact](https://www.habitoo.ro/contact): demonstrație, telefon, WhatsApp

## Opțional

- [Termeni și condiții](https://www.habitoo.ro/termeni)
- [Politica de confidențialitate](https://www.habitoo.ro/politica-de-confidentialitate)
`;

export const PUBLIC_ROBOTS_TXT = `User-agent: Googlebot
Allow: /
Disallow: /anunturi-proprietari

User-agent: Bingbot
Allow: /
Disallow: /anunturi-proprietari

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: *
Allow: /
Disallow: /anunturi-proprietari

Sitemap: https://www.habitoo.ro/sitemap.xml
`;

function hostOf(url: URL, request: Request): string {
  const h = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return h.toLowerCase().split(",")[0].trim().split(":")[0];
}

function normalizePath(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.replace(/\/+$/, "") || "/" : p;
}

export type EdgeDecision =
  | { kind: "redirect"; location: string }
  | { kind: "robots"; body: string }
  | { kind: "pass" };

export function decideEdge(request: Request): EdgeDecision {
  const url = new URL(request.url);
  const host = hostOf(url, request);
  const method = request.method.toUpperCase();
  const isRead = method === "GET" || method === "HEAD";

  if (host === APEX_HOST) {
    return { kind: "redirect", location: `${PUBLIC_SITE_URL}${url.pathname}${url.search}` };
  }
  if (url.pathname === "/robots.txt" && isRead) {
    return { kind: "robots", body: isCrmHostname(host) ? CRM_ROBOTS_TXT : PUBLIC_ROBOTS_TXT };
  }
  if (isCrmHostname(host) && isRead && MARKETING_PATHS.has(normalizePath(url.pathname))) {
    return { kind: "redirect", location: `${PUBLIC_SITE_URL}${url.pathname}${url.search}` };
  }
  return { kind: "pass" };
}

/** Adaugă X-Robots-Tag pe răspunsurile HTML de pe crm.* (exclus /api/public și non-HTML). */
export function shouldTagNoindex(request: Request, response: Response): boolean {
  const url = new URL(request.url);
  if (!isCrmHostname(hostOf(url, request))) return false;
  if (url.pathname.startsWith("/api/public/")) return false;
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}
