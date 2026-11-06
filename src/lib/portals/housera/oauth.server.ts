/**
 * Housera „Conectează cu Housera”: OAuth 2.0 authorization code + PKCE S256.
 * Pur, cu dependențe injectate. Codul, verifier-ul și cheia nu ajung niciodată în loguri.
 */
import { createHash, randomBytes } from "node:crypto";
import { houseraConnectionEnv, HOUSERA_CALLBACK, HOUSERA_MISSING_MESSAGE, HOUSERA_TIMEOUT_MS, HOUSERA_USER_AGENT, houseraBaseUrl, houseraConfigured, houseraConsentUrl, houseraEnv, houseraKeyMode } from "./config";

type Env = Record<string, string | undefined>;
export type HouseraState = { organizationId: string; createdBy: string | null; verifierEncrypted: string | null };
export interface HouseraOAuthStore {
  insertState(r: { hash: string; organizationId: string; createdBy: string; expiresAt: string; verifierEncrypted: string }): Promise<void>;
  /** Atomic: doar o stare validă, neexpirată, nefolosită; o marchează consumată și golește verifier-ul. */
  consumeState(hash: string, now: string): Promise<HouseraState | null>;
}
export type HouseraOAuthDeps = { store: HouseraOAuthStore; encrypt(v: string): string; decrypt(v: string): string | null; env: Env; fetch?: typeof fetch; now?: () => number };

export class HouseraOAuthError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "HouseraOAuthError"; }
}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function app(env: Env) {
  if (!houseraConfigured(env)) throw new HouseraOAuthError("unconfigured", HOUSERA_MISSING_MESSAGE);
  return { client_id: env["HOUSERA_CLIENT_ID"]!.trim(), client_secret: env["HOUSERA_CLIENT_SECRET"]!.trim() };
}

export function houseraAuthorizationUrl(state: string, verifier: string, env: Env): string {
  const url = new URL(houseraConsentUrl(env));
  url.search = new URLSearchParams({
    response_type: "code", client_id: app(env).client_id, redirect_uri: HOUSERA_CALLBACK,
    state, code_challenge: pkceChallenge(verifier), code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function startHouseraAuthorization(org: string, actor: string, d: HouseraOAuthDeps): Promise<string> {
  app(d.env);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  await d.store.insertState({
    hash: sha(state), organizationId: org, createdBy: actor,
    expiresAt: new Date((d.now?.() ?? Date.now()) + 600_000).toISOString(),
    verifierEncrypted: d.encrypt(verifier),
  });
  return houseraAuthorizationUrl(state, verifier, d.env);
}

export async function consumeHouseraState(raw: string | null, d: HouseraOAuthDeps): Promise<(HouseraState & { verifier: string }) | null> {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const s = await d.store.consumeState(sha(raw), new Date(d.now?.() ?? Date.now()).toISOString());
  const verifier = s?.verifierEncrypted ? d.decrypt(s.verifierEncrypted) : null;
  return s && verifier ? { ...s, verifier } : null;
}

export const HOUSERA_AUTHORIZE_ERRORS: Record<string, string> = {
  access_denied: "Accesul a fost refuzat în Housera. Conectarea nu s-a făcut.",
  invalid_request: "Cererea de conectare către Housera nu a fost validă. Reia conectarea.",
  invalid_scope: "Housera nu a aprobat drepturile cerute pentru Habitoo.",
  unsupported_response_type: "Housera nu acceptă tipul de cerere trimis. Reia conectarea.",
};
export function houseraAuthorizeErrorMessage(error: string): string {
  return HOUSERA_AUTHORIZE_ERRORS[error] ?? "Conectarea Housera nu s-a finalizat. Reia conectarea.";
}

export type HouseraTokens = { access_token: string; expires_at: string; scopes: string[]; connection_id: string };

/** Validează răspunsul /oauth/token; cheia trebuie să corespundă mediului. */
export function parseHouseraToken(body: unknown, env: Env, nowMs: number): HouseraTokens {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const token = typeof b["access_token"] === "string" ? b["access_token"] : "";
  const expected = houseraEnv(env) === "production" ? "live" : "test";
  const expires = Number(b["expires_in"]);
  const connection = b["connection_id"];
  const valid = houseraKeyMode(token) === expected
    && String(b["token_type"]).toLowerCase() === "bearer"
    && Number.isFinite(expires) && expires > 0
    && typeof b["scope"] === "string"
    && (typeof connection === "number" || (typeof connection === "string" && /^\d+$/.test(connection)));
  if (!valid) throw new HouseraOAuthError("invalid_token_response", "Housera a trimis un răspuns de conectare nevalid. Reia conectarea.");
  return {
    access_token: token,
    expires_at: new Date(nowMs + expires * 1000).toISOString(),
    scopes: (b["scope"] as string).split(/\s+/).filter(Boolean),
    connection_id: String(connection),
  };
}

/** Un singur apel, fără reîncercare: un cod refolosit revocă cheia. */
export async function exchangeHouseraCode(code: string, verifier: string, d: HouseraOAuthDeps): Promise<HouseraTokens> {
  const { client_id, client_secret } = app(d.env);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: HOUSERA_CALLBACK, code_verifier: verifier, client_id, client_secret });
  let res: Response;
  try {
    res = await (d.fetch ?? fetch)(new URL("oauth/token", houseraBaseUrl(d.env)).toString(), {
      method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(HOUSERA_TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": HOUSERA_USER_AGENT },
    });
  } catch {
    throw new HouseraOAuthError("timeout", "Housera nu a răspuns la timp. Reia conectarea.");
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { /* ignorat */ }
  if (!res.ok) {
    const err = json && typeof json === "object" ? (json as Record<string, unknown>)["error"] : null;
    if (res.status === 400 && err === "invalid_grant") throw new HouseraOAuthError("invalid_grant", "Codul a expirat, reia conectarea.");
    throw new HouseraOAuthError(typeof err === "string" ? err : `http_${res.status}`, "Housera a refuzat conectarea. Reia conectarea.");
  }
  return parseHouseraToken(json, d.env, d.now?.() ?? Date.now());
}

/** Patch pentru portal_connections (cheia doar criptată). */
export function houseraConnectionPatch(t: HouseraTokens, prevSettings: Record<string, unknown>, encrypt: (v: string) => string, nowIso: string, env: Env = process.env) {
  const settings = { ...prevSettings };
  const nextEnv = houseraEnv(env);
  delete settings["reconnect_required"];
  delete settings["housera_env_mismatch"];
  // Cursorul de evenimente aparține mediului; la schimbare pornim de la zero.
  if (houseraConnectionEnv(prevSettings) !== nextEnv) delete settings["housera_events_cursor"];
  settings["housera_env"] = nextEnv;
  settings["oauth"] = { connected_at: nowIso, expires_at: t.expires_at, scopes: t.scopes, connection_id: t.connection_id };
  return {
    portal_credentials_encrypted: encrypt(t.access_token),
    external_account_id: t.connection_id,
    authentication_mode: "oauth",
    direction: "habitoo_to_portal",
    status: "connected",
    last_sync_status: null,
    last_sync_error: null,
    settings,
  };
}
