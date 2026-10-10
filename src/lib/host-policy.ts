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
  "/integrari",
  "/preturi",
  "/despre",
  "/blog",
  "/contact",
  "/termeni",
  "/termeni-si-conditii",
  "/politica-de-confidentialitate",
  "/confidentialitate",
]);

export const CRM_ROBOTS_TXT = "User-agent: *\nDisallow: /\nAllow: /api/public/\n";

export const PUBLIC_ROBOTS_TXT = `User-agent: Googlebot
Allow: /
Disallow: /anunturi-proprietari
Disallow: /app
Disallow: /superadmin
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /auth/

User-agent: Bingbot
Allow: /
Disallow: /anunturi-proprietari
Disallow: /app
Disallow: /superadmin
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /auth/

User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
Allow: /blog
Disallow: /anunturi-proprietari
Disallow: /app
Disallow: /superadmin
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /auth/

User-agent: *
Allow: /
Disallow: /anunturi-proprietari
Disallow: /app
Disallow: /superadmin
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /auth/

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
  if (url.pathname === "/llms.txt" && isRead) {
    if (isCrmHostname(host)) {
      return { kind: "redirect", location: `${PUBLIC_SITE_URL}/llms.txt` };
    }
    return { kind: "pass" };
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

export const PUBLIC_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";
const CACHEABLE_PAGES = new Set(["/", "/functionalitati", "/preturi", "/despre", "/contact", "/integrari", "/blog", "/termeni", "/politica-de-confidentialitate"]);

/** Cache public doar pentru paginile de marketing, fără sesiune și fără răspuns personalizat. */
export function publicCacheControl(request: Request, response: Response): string | null {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (response.status !== 200 || response.headers.has("set-cookie")) return null;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return null;
  const path = normalizePath(new URL(request.url).pathname);
  if (!CACHEABLE_PAGES.has(path) && !/^\/blog\/[^/]+$/.test(path)) return null;
  if (request.headers.get("authorization")) return null;
  const cookie = request.headers.get("cookie") ?? "";
  if (/(?:^|;\s*)(?:sb-[^=]*|[^=]*auth-token[^=]*|habitoo[^=]*session[^=]*)=/i.test(cookie)) return null;
  return PUBLIC_CACHE_CONTROL;
}
