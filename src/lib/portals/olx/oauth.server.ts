/**
 * OAuth2 OLX.ro (Partner API 2.0) per agenție, portalul `olx_direct`.
 * Model Storia, dar cu secrete proprii (`OLXRO_CLIENT_ID`, `OLXRO_CLIENT_SECRET`).
 *  - `state` hash-uit, single-use, 10 minute;
 *  - codul (valabil 10 minute) se schimbă imediat în callback, cu același redirect_uri;
 *  - tokenurile se salvează criptat; refresh token-ul se rotește → salvăm MEREU cel nou;
 *  - `invalid_grant` la refresh → „necesită reconectare” + o notificare către admini.
 * Tokenurile nu ajung niciodată în UI, loguri sau audit.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PortalError, codeFromHttpStatus, toPortalError } from "../errors";
import {
  OLXRO_AUTHORIZE_URL,
  OLXRO_HOST,
  OLXRO_PARTNER_BASE,
  OLXRO_REDIRECT_URI,
  OLXRO_SCOPE_AUTHORIZE,
  OLXRO_SCOPE_TOKEN,
  OLXRO_STATE_TTL_MS,
  OLXRO_TOKEN_REFRESH_MARGIN_MS,
  OLXRO_TOKEN_URL,
  OLXRO_USER_AGENT,
  OLX_DIRECT_PORTAL_ID as PORTAL,
  isForbiddenOlxPurchase,
} from "./config";
import { olxErrorMessage } from "./errors";

const TIMEOUT_MS = 15_000;

export type OlxTokens = {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  scope: string | null;
  expires_at: string;
};

export type OlxConnectionRow = {
  id: string;
  settings: Record<string, unknown>;
  credentials: string | null;
};

/** Accesul la date, injectabil pentru teste. */
export type OlxStore = {
  insertState(row: { organizationId: string; hash: string; createdBy: string | null; expiresAt: string }): Promise<void>;
  findState(hash: string): Promise<{ id: string; organizationId: string; hash: string; expiresAt: string; consumedAt: string | null; createdBy: string | null } | null>;
  /** Marchează consumat doar dacă încă nu e consumat; true dacă a reușit. */
  consumeState(id: string): Promise<boolean>;
  loadConnection(organizationId: string): Promise<OlxConnectionRow | null>;
  upsertConnection(organizationId: string, existingId: string | null, patch: Record<string, unknown>): Promise<void>;
  listConnectedOrganizations(): Promise<string[]>;
  listAgencyAdmins(organizationId: string): Promise<string[]>;
  insertNotification(n: { organizationId: string; userId: string; title: string; body: string; link: string }): Promise<void>;
};

export type OlxDeps = {
  store: OlxStore;
  fetch: typeof fetch;
  encrypt: (plain: string) => string;
  decrypt: (payload: string | null) => string | null;
  now: () => number;
};

type AppCreds = { clientId: string; clientSecret: string };

function appCredentials(): AppCreds {
  const clientId = process.env["OLXRO_CLIENT_ID"]?.trim();
  const clientSecret = process.env["OLXRO_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) {
    throw new PortalError(
      "CONFIG_ERROR",
      "missing_olxro_app_credentials",
      "Integrarea OLX.ro nu este configurată: lipsesc credențialele de aplicație OLX.ro.",
    );
  }
  return { clientId, clientSecret };
}

export function olxAppConfigured(): boolean {
  try {
    appCredentials();
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ dependențe reale

async function defaultDeps(): Promise<OlxDeps> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const crypto = await import("../crypto.server");
  const store: OlxStore = {
    async insertState(r) {
      const { error } = await db.from("portal_oauth_states").insert({
        organization_id: r.organizationId,
        portal: PORTAL,
        state_hash: r.hash,
        created_by: r.createdBy,
        expires_at: r.expiresAt,
      });
      if (error) throw new PortalError("CONFIG_ERROR", "state_persist_failed");
    },
    async findState(hash) {
      const { data } = await db
        .from("portal_oauth_states")
        .select("id, organization_id, state_hash, expires_at, consumed_at, created_by")
        .eq("portal", PORTAL)
        .eq("state_hash", hash)
        .maybeSingle();
      return data
        ? {
            id: data.id,
            organizationId: data.organization_id,
            hash: data.state_hash,
            expiresAt: data.expires_at,
            consumedAt: data.consumed_at,
            createdBy: data.created_by ?? null,
          }
        : null;
    },
    async consumeState(id) {
      const { data } = await db
        .from("portal_oauth_states")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", id)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle();
      return Boolean(data);
    },
    async loadConnection(organizationId) {
      const { data } = await db
        .from("portal_connections")
        .select("id, settings, portal_credentials_encrypted")
        .eq("organization_id", organizationId)
        .eq("portal", PORTAL)
        .maybeSingle();
      return data
        ? {
            id: data.id,
            settings: (data.settings ?? {}) as Record<string, unknown>,
            credentials: data.portal_credentials_encrypted ?? null,
          }
        : null;
    },
    async upsertConnection(organizationId, existingId, patch) {
      if (existingId) {
        await db.from("portal_connections").update(patch as never).eq("id", existingId);
      } else {
        await db
          .from("portal_connections")
          .insert({ organization_id: organizationId, portal: PORTAL, ...patch } as never);
      }
    },
    async listConnectedOrganizations() {
      const { data } = await db
        .from("portal_connections")
        .select("organization_id")
        .eq("portal", PORTAL)
        .not("portal_credentials_encrypted", "is", null);
      return (data ?? []).map((r) => r.organization_id);
    },
    async listAgencyAdmins(organizationId) {
      const { data } = await db
        .from("user_roles")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "agency_admin");
      return [...new Set((data ?? []).map((r) => r.user_id))];
    },
    async insertNotification(n) {
      await db.from("notifications").insert({
        organization_id: n.organizationId,
        user_id: n.userId,
        type: "portal_failure",
        title: n.title,
        body: n.body,
        link: n.link,
      });
    },
  };
  return {
    store,
    fetch: (...a) => fetch(...a),
    encrypt: crypto.encryptPortalCredential,
    decrypt: crypto.decryptPortalCredential,
    now: () => Date.now(),
  };
}

async function resolve(deps?: OlxDeps): Promise<OlxDeps> {
  return deps ?? defaultDeps();
}

// ----------------------------------------------------------------- state CSRF

export function hashOlxState(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createOlxOAuthState(
  input: { organizationId: string; createdBy: string | null },
  deps?: OlxDeps,
): Promise<string> {
  const d = await resolve(deps);
  const raw = randomBytes(32).toString("base64url");
  await d.store.insertState({
    organizationId: input.organizationId,
    hash: hashOlxState(raw),
    createdBy: input.createdBy,
    expiresAt: new Date(d.now() + OLXRO_STATE_TTL_MS).toISOString(),
  });
  return raw;
}

export async function consumeOlxOAuthState(
  raw: string | null,
  deps?: OlxDeps,
): Promise<{ organizationId: string; createdBy: string | null } | null> {
  if (!raw || raw.length < 20 || raw.length > 200) return null;
  const d = await resolve(deps);
  const hash = hashOlxState(raw);
  const row = await d.store.findState(hash);
  if (!row || row.consumedAt) return null;
  const a = Buffer.from(row.hash, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (new Date(row.expiresAt).getTime() < d.now()) return null;
  if (!(await d.store.consumeState(row.id))) return null;
  return { organizationId: row.organizationId, createdBy: row.createdBy };
}

export function olxAuthorizationUrl(state: string): string {
  const { clientId } = appCredentials();
  const url = new URL(OLXRO_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OLXRO_SCOPE_AUTHORIZE);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", OLXRO_REDIRECT_URI);
  // URLSearchParams codifică spațiile ca „+”: scope=read+write+v2, conform OLX.
  return url.toString();
}

// ------------------------------------------------------------------ tokenuri

async function tokenRequest(payload: Record<string, string>, d: OlxDeps): Promise<OlxTokens> {
  const { clientId, clientSecret } = appCredentials();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await d.fetch(OLXRO_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": OLXRO_USER_AGENT,
      },
      body: JSON.stringify({
        ...payload,
        client_id: clientId,
        client_secret: clientSecret,
        scope: OLXRO_SCOPE_TOKEN,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw toPortalError(error);
  } finally {
    clearTimeout(timer);
  }
  const raw = (await res.text().catch(() => "")).slice(0, 1500);
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const invalidGrant = body["error"] === "invalid_grant";
    throw new PortalError(
      codeFromHttpStatus(res.status),
      invalidGrant ? "invalid_grant" : `token_http_${res.status}`,
      invalidGrant
        ? "OLX a refuzat autorizarea: codul sau tokenul a expirat ori a fost deja folosit. Reconectează contul OLX."
        : res.status === 400 || res.status === 401
          ? "OLX a refuzat autorizarea. Reia conectarea contului OLX."
          : "OLX nu a putut emite tokenul. Reîncearcă în câteva minute.",
    );
  }
  const access = typeof body["access_token"] === "string" ? (body["access_token"] as string) : "";
  if (!access) throw new PortalError("AUTH_ERROR", "token_response_without_access_token");
  const expiresIn = Number(body["expires_in"]);
  return {
    access_token: access,
    refresh_token: typeof body["refresh_token"] === "string" ? (body["refresh_token"] as string) : null,
    token_type: typeof body["token_type"] === "string" ? (body["token_type"] as string) : "bearer",
    scope: typeof body["scope"] === "string" ? (body["scope"] as string) : null,
    expires_at: new Date(
      d.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86_400) * 1000,
    ).toISOString(),
  };
}

export async function exchangeOlxAuthorizationCode(code: string, deps?: OlxDeps): Promise<OlxTokens> {
  const d = await resolve(deps);
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: OLXRO_REDIRECT_URI },
    d,
  );
}

export async function loadOlxTokens(organizationId: string, deps?: OlxDeps): Promise<OlxTokens | null> {
  const d = await resolve(deps);
  const row = await d.store.loadConnection(organizationId);
  if (!row?.credentials) return null;
  try {
    const plain = d.decrypt(row.credentials);
    if (!plain) return null;
    const parsed = JSON.parse(plain) as OlxTokens;
    return parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveOlxTokens(
  input: { organizationId: string; tokens: OlxTokens; actorId: string | null; initial: boolean },
  deps?: OlxDeps,
): Promise<void> {
  const d = await resolve(deps);
  const row = await d.store.loadConnection(input.organizationId);
  const now = new Date(d.now()).toISOString();
  const settings = { ...(row?.settings ?? {}) };
  const prev = (settings["oauth"] ?? {}) as Record<string, unknown>;
  settings["oauth"] = {
    connected_at: input.initial ? now : (prev["connected_at"] ?? now),
    refreshed_at: input.initial ? null : now,
    expires_at: input.tokens.expires_at,
    scope: input.tokens.scope,
    has_refresh_token: Boolean(input.tokens.refresh_token),
  };
  delete settings["reconnect_required"];
  delete settings["reconnect_required_at"];
  await d.store.upsertConnection(input.organizationId, row?.id ?? null, {
    direction: "habitoo_to_portal",
    authentication_mode: "oauth",
    portal_credentials_encrypted: d.encrypt(JSON.stringify(input.tokens)),
    settings,
    status: "connected",
    last_sync_error: null,
    ...(input.initial ? { last_sync_status: "ok", last_sync_at: now } : {}),
    updated_by: input.actorId,
    ...(row ? {} : { created_by: input.actorId }),
  });
}

export async function clearOlxTokens(organizationId: string, actorId: string | null, deps?: OlxDeps) {
  const d = await resolve(deps);
  const row = await d.store.loadConnection(organizationId);
  if (!row) return;
  const settings = { ...row.settings };
  delete settings["oauth"];
  await d.store.upsertConnection(organizationId, row.id, {
    portal_credentials_encrypted: null,
    settings,
    status: "disconnected",
    last_sync_error: null,
    updated_by: actorId,
  });
}

export function isPermanentOlxRefreshFailure(error: unknown): boolean {
  return (
    error instanceof PortalError &&
    (error.detail === "invalid_grant" || /^token_http_(400|401|403)$/.test(error.detail ?? ""))
  );
}

export async function markOlxReconnectRequired(
  organizationId: string,
  reason: string,
  deps?: OlxDeps,
): Promise<void> {
  const d = await resolve(deps);
  const row = await d.store.loadConnection(organizationId);
  if (!row) return;
  const settings = { ...row.settings };
  const already = settings["reconnect_required"] === true;
  settings["reconnect_required"] = true;
  settings["reconnect_required_at"] =
    settings["reconnect_required_at"] ?? new Date(d.now()).toISOString();
  await d.store.upsertConnection(organizationId, row.id, {
    settings,
    status: "error",
    last_sync_error: "Reconectează contul OLX: autorizarea nu mai poate fi reînnoită.",
  });
  if (already) return;
  for (const userId of await d.store.listAgencyAdmins(organizationId)) {
    await d.store.insertNotification({
      organizationId,
      userId,
      title: "Reconectează contul OLX",
      body: "Autorizarea contului OLX a expirat sau a fost revocată. Reconectează contul din Setări → Portaluri.",
      link: "/app/settings?tab=portals",
    });
  }
  console.warn(`[olx_direct] conexiune marcată pentru reconectare (${reason})`);
}

/** Reîmprospătează tokenul agenției și salvează MEREU refresh token-ul nou (rotit). */
export async function refreshOlxTokensForOrg(organizationId: string, deps?: OlxDeps): Promise<OlxTokens> {
  const d = await resolve(deps);
  const tokens = await loadOlxTokens(organizationId, d);
  if (!tokens) throw new PortalError("AUTH_ERROR", "olx_not_connected", "Contul OLX al agenției nu este conectat.");
  if (!tokens.refresh_token) {
    await markOlxReconnectRequired(organizationId, "refresh_token_missing", d);
    throw new PortalError("AUTH_ERROR", "olx_refresh_token_missing", "Reconectează contul OLX.");
  }
  let next: OlxTokens;
  try {
    next = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }, d);
  } catch (error) {
    if (isPermanentOlxRefreshFailure(error)) {
      await markOlxReconnectRequired(organizationId, (error as PortalError).detail ?? "refresh_failed", d);
    }
    throw error;
  }
  const saved: OlxTokens = { ...next, refresh_token: next.refresh_token ?? tokens.refresh_token };
  await saveOlxTokens({ organizationId, tokens: saved, actorId: null, initial: false }, d);
  return saved;
}

export async function getOlxAccessToken(
  organizationId: string,
  options: { force?: boolean } = {},
  deps?: OlxDeps,
): Promise<string> {
  const d = await resolve(deps);
  const tokens = await loadOlxTokens(organizationId, d);
  if (!tokens) {
    throw new PortalError("AUTH_ERROR", "olx_not_connected", "Contul OLX al agenției nu este conectat.");
  }
  const soon = new Date(tokens.expires_at).getTime() - d.now() <= OLXRO_TOKEN_REFRESH_MARGIN_MS;
  if (!options.force && !soon) return tokens.access_token;
  return (await refreshOlxTokensForOrg(organizationId, d)).access_token;
}

/** Cron zilnic: reîmprospătează tokenul fiecărei agenții conectate. */
export async function refreshAllOlxConnections(
  deps?: OlxDeps,
): Promise<{ refreshed: number; reconnect: number; failed: number }> {
  const d = await resolve(deps);
  const result = { refreshed: 0, reconnect: 0, failed: 0 };
  for (const orgId of await d.store.listConnectedOrganizations()) {
    const row = await d.store.loadConnection(orgId);
    if (row?.settings["reconnect_required"] === true) continue;
    try {
      await refreshOlxTokensForOrg(orgId, d);
      result.refreshed += 1;
    } catch (error) {
      if (isPermanentOlxRefreshFailure(error)) result.reconnect += 1;
      else result.failed += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------- Partner API 2.0

export type OlxPartnerResponse = { status: number; body: Record<string, unknown> | null };

/** Cerere către https://www.olx.ro/api/partner/* în numele agenției. */
export async function olxPartnerRequest(
  organizationId: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  payload?: unknown,
  deps?: OlxDeps,
  retried = false,
): Promise<OlxPartnerResponse> {
  const rel = path.startsWith("/") ? path : `/${path}`;
  if (isForbiddenOlxPurchase(method, rel)) {
    throw new PortalError(
      "NOT_SUPPORTED",
      "olx_purchase_forbidden",
      "Habitoo nu cumpără pachete sau promovări OLX.",
    );
  }
  const d = await resolve(deps);
  const url = new URL(`${OLXRO_PARTNER_BASE}${rel}`);
  if (url.protocol !== "https:" || url.hostname !== OLXRO_HOST || !url.pathname.startsWith("/api/partner/")) {
    throw new PortalError("CONFIG_ERROR", "blocked_host");
  }
  const token = await getOlxAccessToken(organizationId, { force: retried }, d);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await d.fetch(url.toString(), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        version: "2.0",
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": OLXRO_USER_AGENT,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
    });
  } catch (error) {
    throw toPortalError(error);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && !retried) {
    return olxPartnerRequest(organizationId, method, path, payload, d, true);
  }
  const raw = (await res.text().catch(() => "")).slice(0, 4000);
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (res.status < 200 || res.status >= 300) {
    throw new PortalError(codeFromHttpStatus(res.status), `olx_http_${res.status}`, olxErrorMessage(res.status, body));
  }
  return { status: res.status, body };
}

export type OlxAccountSummary = {
  name: string | null;
  email: string | null;
  isBusiness: boolean | null;
  balance: { sum: number | null; currency: string | null } | null;
  packets: { name: string; left: number | null; total: number | null; validTo: string | null }[];
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Testul conexiunii: cont, sold și pachete active. Fără tokenuri în rezultat. */
export async function testOlxConnection(organizationId: string, deps?: OlxDeps): Promise<OlxAccountSummary> {
  const me = await olxPartnerRequest(organizationId, "GET", "/users/me", undefined, deps);
  const balance = await olxPartnerRequest(organizationId, "GET", "/users/me/account-balance", undefined, deps);
  const packets = await olxPartnerRequest(organizationId, "GET", "/users/me/packets?availability=active", undefined, deps);
  const user = ((me.body?.["data"] ?? me.body) ?? {}) as Record<string, unknown>;
  const bal = ((balance.body?.["data"] ?? balance.body) ?? {}) as Record<string, unknown>;
  const list = (packets.body?.["data"] ?? []) as unknown;
  return {
    name: str(user["name"]),
    email: str(user["email"]),
    isBusiness: typeof user["is_business"] === "boolean" ? (user["is_business"] as boolean) : null,
    balance: { sum: num(bal["sum"] ?? bal["wallet"] ?? bal["balance"]), currency: str(bal["currency"]) ?? "RON" },
    packets: (Array.isArray(list) ? list : []).map((p) => {
      const item = (p ?? {}) as Record<string, unknown>;
      return {
        name: str(item["name"]) ?? str(item["type"]) ?? "Pachet",
        left: num(item["left"] ?? item["remaining"]),
        total: num(item["size"] ?? item["total"]),
        validTo: str(item["valid_to"] ?? item["expires_at"]),
      };
    }),
  };
}

// ------------------------------------------------- token de aplicație (taxonomie)

/** Token `client_credentials` (scope `v2 read write`) — folosit doar pentru GET-uri de taxonomie. */
export async function olxAppAccessToken(deps?: Partial<Pick<OlxDeps, "fetch" | "now">>): Promise<string> {
  const d = { fetch: deps?.fetch ?? fetch, now: deps?.now ?? Date.now } as OlxDeps;
  const tokens = await tokenRequest({ grant_type: "client_credentials" }, d);
  return tokens.access_token;
}

/** GET public de taxonomie cu tokenul de aplicație; doar host-ul OLX.ro permis. */
export async function olxAppGet(
  token: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  const url = new URL(`${OLXRO_PARTNER_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (url.hostname !== OLXRO_HOST || !url.pathname.startsWith("/api/partner/")) {
    throw new PortalError("CONFIG_ERROR", "blocked_host");
  }
  const res = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, version: "2.0", accept: "application/json", "user-agent": OLXRO_USER_AGENT },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new PortalError(codeFromHttpStatus(res.status), `olx_http_${res.status}`, olxErrorMessage(res.status, body));
  return body;
}
