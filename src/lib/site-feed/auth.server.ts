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
  /** Din ce credențial a venit cererea: tokenul de site sau o cheie de portal. */
  source: "site_token" | "portal_key";
  /**
   * Portalul care citește feedul, când cererea vine cu o cheie de portal.
   * `null` = token de site (feedul propriu al agenției, fără filtrare pe portal).
   * Feedul portalului expune EXCLUSIV ofertele bifate pentru acel portal:
   * altfel o ofertă retrasă ar fi reimportată la următoarea citire.
   */
  portal: string | null;
  scopes: string[];
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
  const alt =
    request.headers.get("x-habitoo-feed-token") ??
    request.headers.get("x-api-key") ??
    request.headers.get("x-apikey");
  return alt?.trim() || null;
}

function tokenPrefixOf(token: string | null): string | null {
  if (!token) return null;
  const prefix = token.split(".")[0] ?? "";
  if (prefix.startsWith("hbt_")) return prefix;
  // Cheile emise pentru portaluri: <portal>_portal_<8 hex>
  return /_portal_[0-9a-f]{8}$/.test(prefix) ? prefix : null;
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

/** Opțiuni de autentificare. Comportamentul implicit rămâne neschimbat. */
export type FeedAuthOptions = {
  /**
   * Acceptă tokenul și din parametrul de URL `?token=` / `?key=` /
   * `?api_key=` / `?apikey=`.
   * Se activează DOAR pentru portalurile care nu pot trimite headere
   * (ex. iMove citește un URL de feed simplu).
   */
  allowQueryToken?: boolean;
  /**
   * Acceptă și cheia API emisă de portal și salvată de utilizator în
   * configurarea integrării (`portal_connections.portal_credentials_encrypted`).
   * Se activează doar pe ruta portalului respectiv (ex. feedul iMove), unde
   * credențialul este emis de portal, nu de Habitoo.
   */
  portalCredential?: string;
};


export async function authenticateFeedRequest(
  request: Request,
  options: FeedAuthOptions = {},
): Promise<FeedAuth> {
  let token = readTokenFromRequest(request);
  if (!token && options.allowQueryToken) {
    const url = new URL(request.url);
    // Sync-urile generice de URL (ex. iMove) nu pot trimite headere: acceptăm
    // cheia și ca parametru de query, sub numele uzuale.
    token =
      (
        url.searchParams.get("token") ??
        url.searchParams.get("key") ??
        url.searchParams.get("api_key") ??
        url.searchParams.get("apikey") ??
        url.searchParams.get("apiKey")
      )?.trim() || null;
  }
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
  const hash = hashFeedToken(token);
  const { data, error } = await supabaseAdmin
    .from("site_feed_tokens")
    .select("id, organization_id, token_prefix, revoked_at, request_count")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  if (!error && data) {
    await supabaseAdmin
      .from("site_feed_tokens")
      .update({ last_used_at: new Date().toISOString(), request_count: (data.request_count ?? 0) + 1 })
      .eq("id", data.id);

    return {
      ok: true,
      organizationId: data.organization_id,
      tokenId: data.id,
      tokenPrefix: data.token_prefix,
      source: "site_token",
      portal: null,
      scopes: ["feed:read", "agents:read", "leads:write"],
    };
  }

  // Fallback: cheie emisă de Habitoo pentru un portal (direcția portal → Habitoo).
  // Agenția este determinată EXCLUSIV din cheie, niciodată din query/body.
  const { data: portalKey } = await supabaseAdmin
    .from("portal_api_keys")
    .select("id, organization_id, portal, key_prefix, status, scopes, expires_at, request_count")
    .eq("key_hash", hash)
    .eq("status", "active")
    .maybeSingle();

  if (portalKey && (!portalKey.expires_at || new Date(portalKey.expires_at).getTime() > Date.now())) {
    await supabaseAdmin
      .from("portal_api_keys")
      .update({
        last_used_at: new Date().toISOString(),
        request_count: (portalKey.request_count ?? 0) + 1,
      })
      .eq("id", portalKey.id);

    return {
      ok: true,
      organizationId: portalKey.organization_id,
      tokenId: portalKey.id,
      tokenPrefix: portalKey.key_prefix,
      source: "portal_key",
      portal: portalKey.portal ?? null,
      scopes: portalKey.scopes ?? [],
    };
  }

  // Fallback: cheia API emisă de portal (ex. iMove) și salvată de utilizator în
  // configurarea integrării. Agenția rezultă exclusiv din conexiunea găsită.
  if (options.portalCredential) {
    const { data: connections } = await supabaseAdmin
      .from("portal_connections")
      .select("id, organization_id, portal_credentials_encrypted")
      .eq("portal", options.portalCredential)
      .not("portal_credentials_encrypted", "is", null);

    const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
    for (const conn of connections ?? []) {
      let saved: string | null = null;
      try {
        saved = decryptPortalCredential(conn.portal_credentials_encrypted);
      } catch {
        saved = null;
      }
      if (!saved) continue;
      const savedHash = hashFeedToken(saved);
      if (savedHash === hash) {
        return {
          ok: true,
          organizationId: conn.organization_id,
          tokenId: conn.id,
          tokenPrefix: `${options.portalCredential}_cred`,
          source: "portal_key",
          portal: options.portalCredential,
          scopes: ["feed:read"],
        };
      }
    }
  }

  // Mesaj generic, fără detalii care ar permite enumerarea tokenurilor.

  return { ok: false, status: 401, message: "Invalid or revoked API token.", tokenPrefix: prefix };
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
  options: FeedAuthOptions = {},
): Promise<Response> {
  const method = request.method;
  const auth = await authenticateFeedRequest(request, options);

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
