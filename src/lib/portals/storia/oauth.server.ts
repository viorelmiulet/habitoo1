/**
 * OAuth2 per agenție pentru Storia.ro (OLX Group RE API).
 *
 * Model diferit de restul portalurilor: Habitoo are UN SINGUR set de
 * credențiale de aplicație (client id/secret, basic base64, api key), iar
 * FIECARE agenție își autorizează propriul cont Storia. Rezultatul autorizării
 * (`access_token` + `refresh_token`) se salvează criptat per agenție în
 * `portal_connections.portal_credentials_encrypted`.
 *
 * Reguli respectate:
 *  - secretele se citesc din `process.env` doar în interiorul funcțiilor;
 *  - tokenurile nu se loghează, nu se returnează către client, nu apar în audit;
 *  - `state` este imprevizibil, legat de agenție, cu un singur consum;
 *  - codul de autorizare este valabil 60 de secunde → schimb imediat pe token;
 *  - `access_token` expiră în ~1h → reîmprospătare automată + o reîncercare a
 *    cererii eșuate cu 401.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PortalError, codeFromHttpStatus, toPortalError } from "../errors";
import {
  OLX_API_BASE,
  OLX_TOKEN_PATH,
  OLX_TOKEN_REFRESH_MARGIN_MS,
  OLX_USER_AGENT,
  STORIA_AUTHORIZE_URL,
  STORIA_STATE_TTL_MS,
} from "./config";

const REQUEST_TIMEOUT_MS = 15_000;

export type StoriaTokens = {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  scope: string | null;
  /** ISO — momentul calculat de expirare a `access_token`. */
  expires_at: string;
};

/** Metadate NEsecrete despre conexiunea OAuth, sigure de afișat în UI. */
export type StoriaOAuthMeta = {
  connected_at: string | null;
  refreshed_at: string | null;
  expires_at: string | null;
  scope: string | null;
  has_refresh_token: boolean;
};

type OlxAppCredentials = {
  clientId: string;
  basic: string;
  apiKey: string;
};

/** Credențialele de aplicație. Lipsa oricăreia oprește fluxul cu mesaj clar. */
function appCredentials(): OlxAppCredentials {
  const clientId = process.env["OLX_CLIENT_ID"];
  const clientSecret = process.env["OLX_CLIENT_SECRET"];
  const basicFromEnv = process.env["OLX_BASIC_BASE64"];
  const apiKey = process.env["OLX_API_KEY"];

  if (!clientId || !apiKey) {
    throw new PortalError(
      "CONFIG_ERROR",
      "missing_olx_app_credentials",
      "Integrarea Storia nu este configurată: lipsesc credențialele de aplicație OLX.",
    );
  }
  const basic =
    basicFromEnv?.trim() ||
    (clientSecret ? Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64") : "");
  if (!basic) {
    throw new PortalError(
      "CONFIG_ERROR",
      "missing_olx_basic_auth",
      "Integrarea Storia nu este configurată: lipsește autentificarea Basic pentru OLX.",
    );
  }
  return { clientId, basic, apiKey };
}

export function storiaAppConfigured(): boolean {
  try {
    appCredentials();
    return true;
  } catch {
    return false;
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------------------------------------------------------------- state (CSRF)

function hashState(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generează un `state` imprevizibil, îl leagă de agenție și îl persistă doar ca
 * hash. Valabil 10 minute, consumabil o singură dată.
 */
export async function createStoriaOAuthState(input: {
  organizationId: string;
  createdBy: string | null;
}): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const db = await admin();
  const { error } = await db.from("portal_oauth_states").insert({
    organization_id: input.organizationId,
    portal: "storia",
    state_hash: hashState(raw),
    created_by: input.createdBy,
    expires_at: new Date(Date.now() + STORIA_STATE_TTL_MS).toISOString(),
  });
  if (error) throw new PortalError("CONFIG_ERROR", "state_persist_failed");
  return raw;
}

/** Validează și consumă `state`-ul primit la retur. Returnează agenția vizată. */
export async function consumeStoriaOAuthState(
  raw: string | null,
): Promise<{ organizationId: string } | null> {
  if (!raw || raw.length < 20 || raw.length > 200) return null;
  const db = await admin();
  const { data } = await db
    .from("portal_oauth_states")
    .select("id, organization_id, state_hash, expires_at, consumed_at")
    .eq("portal", "storia")
    .eq("state_hash", hashState(raw))
    .maybeSingle();
  if (!data || data.consumed_at) return null;

  // Comparație în timp constant, chiar dacă selecția s-a făcut deja pe hash.
  const expected = Buffer.from(data.state_hash, "utf8");
  const actual = Buffer.from(hashState(raw), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const { data: consumed } = await db
    .from("portal_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  // Dacă altcineva l-a consumat între timp, refuzăm (single-use real).
  if (!consumed) return null;

  return { organizationId: data.organization_id };
}

/** URL-ul de autorizare către care trimitem browserul agenției. */
export function storiaAuthorizationUrl(state: string): string {
  const { clientId } = appCredentials();
  const url = new URL(STORIA_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  return url.toString();
}

// -------------------------------------------------------------- token requests

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  message?: unknown;
};

function parseTokens(body: TokenResponse): StoriaTokens {
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) throw new PortalError("AUTH_ERROR", "token_response_without_access_token");
  const expiresIn = Number(body.expires_in);
  return {
    access_token: accessToken,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : null,
    token_type: typeof body.token_type === "string" ? body.token_type : "Bearer",
    scope: typeof body.scope === "string" ? body.scope : null,
    expires_at: new Date(
      Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    ).toISOString(),
  };
}

async function tokenRequest(payload: Record<string, string>): Promise<StoriaTokens> {
  const { basic, apiKey } = appCredentials();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${OLX_API_BASE}${OLX_TOKEN_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "x-api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": OLX_USER_AGENT,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    throw toPortalError(error);
  } finally {
    clearTimeout(timer);
  }

  const raw = (await response.text().catch(() => "")).slice(0, 1500);
  let body: TokenResponse = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as TokenResponse;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const code = codeFromHttpStatus(response.status);
    const message =
      response.status === 400 || response.status === 401 || response.status === 403
        ? "Storia a refuzat autorizarea. Codul poate fi expirat (valabil 60 de secunde) sau deja folosit — reia conectarea."
        : "Storia nu a putut emite tokenul. Reîncearcă în câteva minute.";
    throw new PortalError(code, `token_http_${response.status}`, message);
  }
  return parseTokens(body);
}

export async function exchangeStoriaAuthorizationCode(code: string): Promise<StoriaTokens> {
  return tokenRequest({ grant_type: "authorization_code", code });
}

export async function refreshStoriaTokens(refreshToken: string): Promise<StoriaTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// ------------------------------------------------------------- token persistăm

export async function loadStoriaTokens(organizationId: string): Promise<StoriaTokens | null> {
  const db = await admin();
  const { data } = await db
    .from("portal_connections")
    .select("portal_credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("portal", "storia")
    .maybeSingle();
  if (!data?.portal_credentials_encrypted) return null;
  try {
    const { decryptPortalCredential } = await import("../crypto.server");
    const plain = decryptPortalCredential(data.portal_credentials_encrypted);
    if (!plain) return null;
    const parsed = JSON.parse(plain) as StoriaTokens;
    return typeof parsed.access_token === "string" && parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveStoriaTokens(input: {
  organizationId: string;
  tokens: StoriaTokens;
  actorId: string | null;
  /** Prima conectare (nu doar o reîmprospătare). */
  initial: boolean;
}): Promise<void> {
  const db = await admin();
  const { encryptPortalCredential } = await import("../crypto.server");
  const now = new Date().toISOString();

  const { data: row } = await db
    .from("portal_connections")
    .select("id, settings")
    .eq("organization_id", input.organizationId)
    .eq("portal", "storia")
    .maybeSingle();

  const settings = { ...((row?.settings ?? {}) as Record<string, unknown>) };
  const previous = (settings["oauth"] ?? {}) as Partial<StoriaOAuthMeta>;
  const meta: StoriaOAuthMeta = {
    connected_at: input.initial ? now : (previous.connected_at ?? now),
    refreshed_at: input.initial ? null : now,
    expires_at: input.tokens.expires_at,
    scope: input.tokens.scope,
    has_refresh_token: Boolean(input.tokens.refresh_token),
  };
  settings["oauth"] = meta;

  const patch = {
    organization_id: input.organizationId,
    portal: "storia",
    direction: "habitoo_to_portal",
    authentication_mode: "oauth",
    portal_credentials_encrypted: encryptPortalCredential(JSON.stringify(input.tokens)),
    settings,
    status: "connected",
    last_sync_error: null,
    ...(input.initial ? { last_sync_status: "ok", last_sync_at: now } : {}),
    updated_by: input.actorId,
  };

  if (row) {
    await db.from("portal_connections").update(patch as never).eq("id", row.id);
  } else {
    await db
      .from("portal_connections")
      .insert({ ...patch, created_by: input.actorId } as never);
  }
}

export async function clearStoriaTokens(organizationId: string, actorId: string | null): Promise<void> {
  const db = await admin();
  const { data: row } = await db
    .from("portal_connections")
    .select("id, settings")
    .eq("organization_id", organizationId)
    .eq("portal", "storia")
    .maybeSingle();
  if (!row) return;
  const settings = { ...((row.settings ?? {}) as Record<string, unknown>) };
  delete settings["oauth"];
  await db
    .from("portal_connections")
    .update({
      portal_credentials_encrypted: null,
      settings,
      status: "disconnected",
      last_sync_error: null,
      updated_by: actorId,
    } as never)
    .eq("id", row.id);
}

/** Tokenul valabil al agenției, reîmprospătat automat dacă e pe expirare. */
export async function getStoriaAccessToken(
  organizationId: string,
  options: { force?: boolean } = {},
): Promise<string> {
  const tokens = await loadStoriaTokens(organizationId);
  if (!tokens) {
    throw new PortalError(
      "AUTH_ERROR",
      "storia_not_connected",
      "Contul Storia al agenției nu este conectat. Pornește autorizarea din Superadmin → Portaluri.",
    );
  }
  const expiringSoon =
    new Date(tokens.expires_at).getTime() - Date.now() <= OLX_TOKEN_REFRESH_MARGIN_MS;
  if (!options.force && !expiringSoon) return tokens.access_token;

  if (!tokens.refresh_token) {
    throw new PortalError(
      "AUTH_ERROR",
      "storia_refresh_token_missing",
      "Autorizarea Storia a expirat și nu poate fi reînnoită automat. Reia conectarea contului Storia.",
    );
  }
  const refreshed = await refreshStoriaTokens(tokens.refresh_token);
  // OLX rotește refresh_token-ul: păstrăm cel nou, altfel pierdem accesul.
  const next: StoriaTokens = {
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
  };
  await saveStoriaTokens({ organizationId, tokens: next, actorId: null, initial: false });
  return next.access_token;
}

// ------------------------------------------------------------- cereri OLX API

export type OlxResponse = { status: number; body: Record<string, unknown> | null; raw: string };

/**
 * Cerere autorizată către OLX API, în numele agenției.
 * La 401 reîmprospătează tokenul și reîncearcă exact o dată.
 */
export async function olxAuthorizedRequest(
  organizationId: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  payload?: unknown,
  retriedAfterRefresh = false,
): Promise<OlxResponse> {
  const { apiKey } = appCredentials();
  const accessToken = await getStoriaAccessToken(organizationId, { force: retriedAfterRefresh });
  const url = new URL(`${OLX_API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (url.protocol !== "https:" || url.hostname !== "api.olxgroup.com") {
    throw new PortalError("CONFIG_ERROR", "blocked_host");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-api-key": apiKey,
        accept: "application/json",
        "user-agent": OLX_USER_AGENT,
        ...(payload === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
    });
  } catch (error) {
    throw toPortalError(error);
  } finally {
    clearTimeout(timer);
  }

  if ((response.status === 401 || response.status === 403) && !retriedAfterRefresh) {
    return olxAuthorizedRequest(organizationId, method, path, payload, true);
  }

  const raw = (await response.text().catch(() => "")).slice(0, 1500);
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, raw };
}

/** Metadatele NEsecrete ale conexiunii, pentru afișare în Superadmin. */
export function readStoriaOAuthMeta(settings: Record<string, unknown> | null): StoriaOAuthMeta | null {
  const raw = settings?.["oauth"];
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Partial<StoriaOAuthMeta>;
  return {
    connected_at: typeof meta.connected_at === "string" ? meta.connected_at : null,
    refreshed_at: typeof meta.refreshed_at === "string" ? meta.refreshed_at : null,
    expires_at: typeof meta.expires_at === "string" ? meta.expires_at : null,
    scope: typeof meta.scope === "string" ? meta.scope : null,
    has_refresh_token: meta.has_refresh_token === true,
  };
}
