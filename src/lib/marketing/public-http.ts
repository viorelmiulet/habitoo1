export const PUBLIC_PAGE_CACHE = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";
/** Live agency summaries must reflect offer edits on the next page read. */
export const publicPageCache = (path: string) => /^\/agentii\/[^/]+\/?$/.test(path) ? "no-store" : PUBLIC_PAGE_CACHE;
const PUBLIC_ROOTS = new Set(["", "preturi", "despre", "contact", "functionalitati", "integrari", "dezvoltatori", "agentii", "blog", "intrebari-frecvente", "anunturi-proprietari", "analiza-comparativa-de-piata", "colaborare-intre-agentii", "comisioane-agenti-imobiliari", "import-proprietati", "extensie-chrome", "termeni", "politica-de-confidentialitate"]);

export function isMarketingPath(path: string): boolean {
  return PUBLIC_ROOTS.has(path.split("/")[1] ?? "") && !path.includes(".");
}
export function permanentPublicRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method) || url.pathname === "/" || !url.pathname.endsWith("/") || !isMarketingPath(url.pathname)) return null;
  url.pathname = url.pathname.replace(/\/+$/, "");
  return new Response(null, { status: 308, headers: { Location: url.href, "Cache-Control": "public, max-age=600" } });
}
export function publicCacheControl(request: Request, response: Response): string | undefined {
  const path = new URL(request.url).pathname;
  if (/^\/(app|api|_serverFn|auth|login|register|superadmin|onboarding)(\/|$)/.test(path)) return "no-store";
  // Never share personalized HTML, redirects, errors or Set-Cookie responses.
  if (!isMarketingPath(path) || !["GET", "HEAD"].includes(request.method)) return undefined;
  if (request.headers.has("authorization") || request.headers.has("cookie") || response.headers.has("set-cookie") || response.status !== 200) return "no-store";
  return response.headers.get("content-type")?.includes("text/html") ? publicPageCache(path) : undefined;
}