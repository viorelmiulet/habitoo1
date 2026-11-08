// Extensia Chrome „Habitoo Captură” — logică pură (fără DB), testabilă.
import { orgBlockReason } from "@/lib/org-access";

export const EXTENSION_API_BASE = "/api/public/extension/v1";
export const EXTENSION_RATE_LIMIT = 60;
export const EXTENSION_MESSAGE_TYPE = "habitoo-extension-token";
const TOKEN_RE = /^hbext_[a-f0-9]{64}$/;

export const isValidNonce = (nonce: unknown): nonce is string =>
  typeof nonce === "string" && /^[A-Za-z0-9]{8,128}$/.test(nonce);

export async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateExtensionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "hbext_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function deviceNameFromUserAgent(ua: string | null | undefined) {
  const s = ua ?? "";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Browser";
  const os = /Windows/.test(s) ? "Windows" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Android/.test(s) ? "Android" : /CrOS/.test(s) ? "ChromeOS" : /Linux/.test(s) ? "Linux" : "";
  return os ? `${browser} pe ${os}` : browser === "Browser" ? "Browser necunoscut" : browser;
}

export type ExtTokenRow = { id: string; user_id: string; organization_id: string; token_hash: string; revoked_at: string | null };
export type ExtAccount = {
  is_active: boolean; full_name: string; role: string;
  org: { id: string; name: string; logo_url: string | null; status: string | null; archived_at: string | null; suspended_reason: string | null } | null;
  profile_org_id: string | null;
};
export type ExtRate = { limit: number; remaining: number; reset: number; allowed: boolean };
export type ExtensionStore = {
  token: (hash: string) => Promise<ExtTokenRow | null>;
  account: (userId: string) => Promise<ExtAccount | null>;
  rate: (tokenId: string) => Promise<ExtRate>;
  touch: (tokenId: string) => Promise<void>;
  revoke: (tokenId: string) => Promise<void>;
};
export type ExtContext = { token: ExtTokenRow; account: ExtAccount; requestId: string; store: ExtensionStore };

export function extError(status: number, code: string, message: string, requestId: string) {
  return Response.json({ error: { code, message, details: [], request_id: requestId } }, { status });
}

/** Autentificare la fiecare cerere: token activ, utilizator activ, agenție activă. Nu loghează niciodată tokenul. */
export async function serveExtension(request: Request, store: ExtensionStore, handler: (c: ExtContext) => Promise<Response>) {
  const requestId = crypto.randomUUID();
  let response: Response; let rate: ExtRate | null = null;
  try {
    const raw = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!raw || !TOKEN_RE.test(raw)) response = extError(401, "UNAUTHORIZED", "Token lipsă sau invalid.", requestId);
    else {
      const token = await store.token(await sha256Hex(raw));
      const account = token && !token.revoked_at ? await store.account(token.user_id) : null;
      if (!token || token.revoked_at || !account || !account.is_active || !account.org || account.profile_org_id !== token.organization_id || account.org.id !== token.organization_id || orgBlockReason(account.org))
        response = extError(401, "UNAUTHORIZED", "Extensia nu mai este conectată. Conecteaz-o din nou.", requestId);
      else {
        try { rate = await store.rate(token.id); } catch { rate = null; }
        if (rate && !rate.allowed) {
          response = extError(429, "RATE_LIMIT_EXCEEDED", "Limita de cereri a fost depășită.", requestId);
          response.headers.set("Retry-After", String(Math.max(1, rate.reset - Math.floor(Date.now() / 1000))));
        } else {
          await store.touch(token.id);
          response = await handler({ token, account, requestId, store });
        }
      }
    }
  } catch {
    response = extError(503, "SERVICE_UNAVAILABLE", "Serviciul nu este disponibil momentan.", requestId);
  }
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Cache-Control", "no-store");
  if (rate) { response.headers.set("X-RateLimit-Limit", String(rate.limit)); response.headers.set("X-RateLimit-Remaining", String(rate.remaining)); response.headers.set("X-RateLimit-Reset", String(rate.reset)); }
  return response;
}

export const meHandler = async ({ account }: ExtContext) =>
  Response.json({ user: { name: account.full_name, role: account.role }, agency: { name: account.org!.name, logo_url: account.org!.logo_url } });

export const revokeHandler = async ({ token, store }: ExtContext) => { await store.revoke(token.id); return new Response(null, { status: 204 }); };

export const methodNotAllowed = (c: ExtContext) => Promise.resolve(extError(405, "METHOD_NOT_ALLOWED", "Metodă neacceptată.", c.requestId));
