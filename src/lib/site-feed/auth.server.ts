// Autentificare + logare pentru feedul public de portaluri (server-only).
// Tokenul este stocat exclusiv ca hash SHA-256; valoarea în clar nu ajunge niciodată
// în DB, în loguri sau în frontend după afișarea unică de la generare.
import { createHash, randomBytes } from "node:crypto";

export const FEED_API_VERSION = "habitoo-site-feed/1.0";
export const FEED_BASE_PATH = "/api/public/sites/v1";

export type FeedAuthOk = {
  ok: true;
  organizationId: string;
  tokenId: string;
  tokenPrefix: string;
};
export type FeedAuthErr = { ok: false; status: 401 | 429; message: string; tokenPrefix: string | null };
export type FeedAuth = FeedAuthOk | FeedAuthErr;

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Generează un token nou: prefix vizibil (identificare) + secret criptografic. */
export function generateFeedToken(): { token: string; prefix: string; hash: string } {
  const prefix = `hbt_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  const token = `${prefix}.${secret}`;
  return { token, prefix, hash: hashFeedToken(token) };
}

/** Extrage tokenul din Authorization: Bearer <token> sau Basic base64(user:token). */
export function readTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const [scheme, ...rest] = header.split(" ");
    const value = rest.join(" ").trim();
    if (!value) return null;
    if (scheme?.toLowerCase() === "bearer") return value;
    if (scheme?.toLowerCase() === "basic") {
      try {
        const decoded = Buffer.from(value, "base64").toString("utf8");
        const idx = decoded.indexOf(":");
        // Compatibil ImmoFlux: tokenul poate fi trimis ca user sau ca parolă.
        const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
        const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
        return pass || user || null;
      } catch {
        return null;
      }
    }
  }
  const alt = request.headers.get("x-habitoo-feed-token");
  return alt?.trim() || null;
}

function tokenPrefixOf(token: string | null): string | null {
  if (!token) return null;
  const prefix = token.split(".")[0] ?? "";
  return prefix.startsWith("hbt_") ? prefix : null;
}

// Rate limit BEST-EFFORT: contorul trăiește în memoria instanței de server, deci
// nu este o protecție distribuită (mai multe instanțe = mai multe bucket-uri).
// Limitarea se face pe token prefix + IP (IP-ul nu este niciodată persistat).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

export async function authenticateFeedRequest(request: Request): Promise<FeedAuth> {
  const token = readTokenFromRequest(request);
  const prefix = tokenPrefixOf(token);
  if (!token) {
    return { ok: false, status: 401, message: "Missing API token.", tokenPrefix: null };
  }
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (rateLimited(`${prefix ?? "anonymous"}|${ip}`)) {
    return { ok: false, status: 429, message: "Too many requests.", tokenPrefix: prefix };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("site_feed_tokens")
    .select("id, organization_id, token_prefix, revoked_at, request_count")
    .eq("token_hash", hashFeedToken(token))
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) {
    // Mesaj generic, fără detalii care ar permite enumerarea tokenurilor.
    return { ok: false, status: 401, message: "Invalid or revoked API token.", tokenPrefix: prefix };
  }

  await supabaseAdmin
    .from("site_feed_tokens")
    .update({ last_used_at: new Date().toISOString(), request_count: (data.request_count ?? 0) + 1 })
    .eq("id", data.id);

  return {
    ok: true,
    organizationId: data.organization_id,
    tokenId: data.id,
    tokenPrefix: data.token_prefix,
  };
}

export async function logFeedAccess(input: {
  organizationId: string | null;
  tokenPrefix: string | null;
  endpoint: string;
  method: string;
  status: number;
  items?: number | null;
  detail?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("site_feed_access_logs").insert({
      organization_id: input.organizationId,
      token_prefix: input.tokenPrefix,
      endpoint: input.endpoint,
      method: input.method,
      status: input.status,
      items: input.items ?? null,
      detail: input.detail ?? null,
    });
  } catch {
    // Logarea nu trebuie să rupă răspunsul feedului.
  }
}

export function jsonResponse(body: unknown, status = 200, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheSeconds > 0 ? `private, max-age=${cacheSeconds}` : "no-store",
      "x-habitoo-api-version": FEED_API_VERSION,
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message, api_version: FEED_API_VERSION }, status);
}

/**
 * Wrapper comun: autentifică, loghează accesul și returnează răspunsul.
 * Orice eroare internă devine 500 fără detalii pentru client.
 */
export async function withFeedAuth(
  request: Request,
  endpoint: string,
  handler: (auth: FeedAuthOk) => Promise<{ response: Response; items?: number }>,
): Promise<Response> {
  const method = request.method;
  const auth = await authenticateFeedRequest(request);
  if (!auth.ok) {
    await logFeedAccess({
      organizationId: null,
      tokenPrefix: auth.tokenPrefix,
      endpoint,
      method,
      status: auth.status,
      // Detaliu generic în loguri: niciodată tokenul, secretul sau headerul Authorization.
      detail: auth.status === 429 ? "rate_limited" : "unauthorized",
    });
    return errorResponse(auth.status, auth.message);
  }
  try {
    const { response, items } = await handler(auth);
    await logFeedAccess({
      organizationId: auth.organizationId,
      tokenPrefix: auth.tokenPrefix,
      endpoint,
      method,
      status: response.status,
      items: items ?? null,
    });
    return response;
  } catch (error) {
    console.error(`[site-feed] ${endpoint} failed`, error);
    await logFeedAccess({
      organizationId: auth.organizationId,
      tokenPrefix: auth.tokenPrefix,
      endpoint,
      method,
      status: 500,
      detail: "internal_error",
    });
    return errorResponse(500, "Internal error.");
  }
}
