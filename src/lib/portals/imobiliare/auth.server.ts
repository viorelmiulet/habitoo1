/**
 * Sesiunea Imobiliare.ro: autorizare, reînnoire automată și deconectare.
 *
 * - prima conectare: utilizator + parolă → access_token + refresh_token;
 * - ulterior se folosește DOAR refresh_token (parola nu se mai stochează);
 * - reînnoire proactivă când mai sunt sub 3 zile din valabilitate, plus
 *   reînnoire reactivă la un 401 primit de la portal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { IMOBILIARE_PATHS, IMOBILIARE_PORTAL_KEY } from "./config";
import {
  encodeImobiliareTokens,
  needsImobiliareRefresh,
  parseImobiliareCredential,
  tokensFromResponse,
  type ImobiliareTokens,
} from "./auth";
import { imobiliareRequest } from "./client.server";

type Admin = SupabaseClient<Database>;

export type ImobiliareSession = {
  accessToken: string;
  username: string | null;
  /** Reînnoiește tokenul și îl persistă; `null` dacă reînnoirea nu reușește. */
  refresh: () => Promise<string | null>;
};

export type SessionResult =
  | { ok: true; session: ImobiliareSession }
  | { ok: false; message: string; detail: string };

async function persistTokens(
  admin: Admin,
  organizationId: string,
  tokens: { username: string | null; accessToken: string; refreshToken: string | null; expiresAt: string },
): Promise<void> {
  const { encryptPortalCredential } = await import("../crypto.server");
  await admin
    .from("portal_connections")
    .update({
      portal_credentials_encrypted: encryptPortalCredential(encodeImobiliareTokens(tokens)),
    } as never)
    .eq("organization_id", organizationId)
    .eq("portal", IMOBILIARE_PORTAL_KEY);
}

async function requestTokens(
  connectionKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; body: unknown } | { ok: false; message: string; status: number }> {
  const response = await imobiliareRequest({
    method: "POST",
    path: IMOBILIARE_PATHS.token,
    body,
    connectionKey,
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        response.classification?.message ??
        `Imobiliare.ro a răspuns HTTP ${response.status} la autorizare.`,
    };
  }
  return { ok: true, body: response.body };
}

/**
 * Obține o sesiune validă pentru agenție. `username` vine din
 * `external_account_id`, credențialul din `portal_credentials_encrypted`.
 */
export async function getImobiliareSession(input: {
  admin: Admin;
  organizationId: string;
  username: string | null;
  credential: string | null;
  now?: number;
}): Promise<SessionResult> {
  const connectionKey = input.organizationId;
  const parsed = parseImobiliareCredential(input.credential);
  if (!parsed) {
    return {
      ok: false,
      message:
        "Conexiunea Imobiliare.ro nu are credențiale salvate. Introduce utilizatorul și parola contului.",
      detail: "missing_credential",
    };
  }

  const username = input.username?.trim() || (parsed.kind === "tokens" ? parsed.username : null);

  // Prima autorizare: utilizator + parolă.
  if (parsed.kind === "password") {
    if (!username) {
      return {
        ok: false,
        message: "Completează utilizatorul contului Imobiliare.ro înainte de conectare.",
        detail: "missing_username",
      };
    }
    const result = await requestTokens(connectionKey, {
      username,
      password: parsed.password,
    });
    if (!result.ok) return { ok: false, message: result.message, detail: "login_failed" };
    const tokens = tokensFromResponse(result.body, null, input.now ?? Date.now());
    if (!tokens) {
      return {
        ok: false,
        message: "Imobiliare.ro nu a returnat un token de acces la autorizare.",
        detail: "missing_access_token",
      };
    }
    await persistTokens(input.admin, input.organizationId, { username, ...tokens });
    return {
      ok: true,
      session: buildSession(input.admin, input.organizationId, {
        kind: "tokens",
        username,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      }),
    };
  }

  let tokens: ImobiliareTokens = { ...parsed, username };

  // Reînnoire proactivă (sub 3 zile din valabilitate).
  if (needsImobiliareRefresh(tokens, input.now ?? Date.now()) && tokens.refreshToken) {
    const refreshed = await refreshTokens(input.admin, input.organizationId, tokens, input.now);
    if (refreshed) tokens = refreshed;
  }

  return { ok: true, session: buildSession(input.admin, input.organizationId, tokens) };
}

async function refreshTokens(
  admin: Admin,
  organizationId: string,
  tokens: ImobiliareTokens,
  now?: number,
): Promise<ImobiliareTokens | null> {
  if (!tokens.refreshToken) return null;
  const result = await requestTokens(organizationId, { refresh_token: tokens.refreshToken });
  if (!result.ok) return null;
  const next = tokensFromResponse(result.body, tokens.refreshToken, now ?? Date.now());
  if (!next) return null;
  await persistTokens(admin, organizationId, { username: tokens.username, ...next });
  return { kind: "tokens", username: tokens.username, ...next };
}

function buildSession(
  admin: Admin,
  organizationId: string,
  tokens: ImobiliareTokens,
): ImobiliareSession {
  let current = tokens;
  return {
    get accessToken() {
      return current.accessToken;
    },
    username: tokens.username,
    refresh: async () => {
      const next = await refreshTokens(admin, organizationId, current);
      if (!next) return null;
      current = next;
      return next.accessToken;
    },
  } as ImobiliareSession;
}

/**
 * Cerere autentificată: la un 401 reînnoiește tokenul o singură dată și reia.
 */
export async function imobiliareAuthedRequest(
  session: ImobiliareSession,
  input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    body?: unknown;
    connectionKey: string;
    timeoutMs?: number;
  },
) {
  const first = await imobiliareRequest({ ...input, accessToken: session.accessToken });
  if (first.classification?.action !== "reauth") return first;
  const token = await session.refresh();
  if (!token) return first;
  return imobiliareRequest({ ...input, accessToken: token });
}

/** Deconectare explicită: invalidează tokenul la portal. */
export async function imobiliareLogout(session: ImobiliareSession, organizationId: string) {
  return imobiliareAuthedRequest(session, {
    method: "POST",
    path: IMOBILIARE_PATHS.logout,
    connectionKey: organizationId,
  });
}
