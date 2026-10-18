/**
 * Facebook Login for Business — părți pure (fără rețea, fără DB), testabile.
 * Nu conține niciun secret; cheile se primesc ca parametri doar pe server.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { META_GRAPH_VERSION } from "./constants";
export { META_GRAPH_VERSION, META_GRAPH_BASE } from "./constants";

export const META_APP_ID = "1074962072209272";
export const META_CONFIG_ID = "929047083622427";
export const META_REDIRECT_URI = "https://crm.habitoo.ro/api/public/meta/oauth/callback";
export const META_STATE_TTL_MS = 10 * 60 * 1000;

export { META_ERROR_MESSAGES, META_NO_INSTAGRAM_MESSAGE } from "./messages";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export type MetaState = { organizationId: string; userId: string; exp: number };

export function signMetaState(
  input: { organizationId: string; userId: string },
  secret: string,
  now = Date.now(),
): string {
  const payload = b64u(
    JSON.stringify({ o: input.organizationId, u: input.userId, exp: now + META_STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  );
  const sig = createHmac("sha256", `${secret}:meta-state`).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyMetaState(state: string | null | undefined, secret: string, now = Date.now()): MetaState | null {
  if (!state) return null;
  const [payload, sig, extra] = state.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", `${secret}:meta-state`).update(payload).digest();
  if (!safeEqual(Buffer.from(sig, "base64url"), expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o?: string; u?: string; exp?: number };
    if (typeof p.o !== "string" || typeof p.u !== "string" || typeof p.exp !== "number") return null;
    if (p.exp < now) return null;
    return { organizationId: p.o, userId: p.u, exp: p.exp };
  } catch {
    return null;
  }
}

export function buildMetaOAuthUrl(state: string): string {
  const u = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", META_APP_ID);
  u.searchParams.set("redirect_uri", META_REDIRECT_URI);
  u.searchParams.set("config_id", META_CONFIG_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

/** Verifică `signed_request` (HMAC-SHA256 cu App Secret) și întoarce payload-ul. */
export function parseSignedRequest(
  signed: string | null | undefined,
  secret: string,
): { user_id: string; [k: string]: unknown } | null {
  if (!signed || !secret) return null;
  const [sig, payload, extra] = signed.split(".");
  if (!sig || !payload || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (!safeEqual(Buffer.from(sig, "base64url"), expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (String(data.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return null;
    if (typeof data.user_id !== "string" || !data.user_id) return null;
    return data as { user_id: string };
  } catch {
    return null;
  }
}

export type GraphPage = {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } | null;
};

/** Doar paginile la care utilizatorul are dreptul CREATE_CONTENT și un token de pagină. */
export function postablePages(pages: GraphPage[]): GraphPage[] {
  return pages.filter((p) => !!p.access_token && (p.tasks ?? []).includes("CREATE_CONTENT"));
}

export class MetaConnectError extends Error {
  constructor(public code: "denied" | "no_pages" | "no_postable_pages" | "exchange_failed" | "config") {
    super(code);
  }
}

export function newConfirmationCode(): string {
  return randomBytes(12).toString("hex");
}

/** Deconectare: revocă la Meta (best-effort), apoi șterge tokenurile local. */
export async function disconnectMetaOrg(deps: {
  loadUserToken: () => Promise<string | null>;
  revoke: (token: string) => Promise<void>;
  clearTokens: () => Promise<void>;
}): Promise<{ revoked: boolean }> {
  const token = await deps.loadUserToken();
  let revoked = false;
  if (token) {
    try {
      await deps.revoke(token);
      revoked = true;
    } catch {
      revoked = false;
    }
  }
  await deps.clearTokens();
  return { revoked };
}
