import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PortalError, codeFromHttpStatus } from "../errors";
import { ZUP_BASE, ZUP_AUTHORIZE, ZUP_CALLBACK, ZUP_TIMEOUT_MS, ZUP_MISSING_MESSAGE, zupConfigured } from "./config";

export type ZupTokens = { access_token: string; refresh_token: string | null; token_type: "Bearer"; expires_at: string; refresh_after: string };
export type ZupConnection = { id: string; credentials: string | null; settings: Record<string, unknown> };
export type ZupState = { id: string; organizationId: string; createdBy: string | null; expiresAt: string };
export interface ZupStore {
  insertState(input: { hash: string; organizationId: string; createdBy: string; expiresAt: string }): Promise<void>;
  consumeState(hash: string, now: string): Promise<ZupState | null>;
  load(org: string): Promise<ZupConnection | null>;
  save(org: string, credentials: string | null, settings: Record<string, unknown>, actor: string | null, expected?: string | null): Promise<boolean>;
  acquire(org: string, owner: string): Promise<boolean>;
  release(org: string, owner: string): Promise<void>;
}
export type ZupDeps = { store: ZupStore; encrypt(value: string): string; decrypt(value: string): string | null; env: Record<string, string | undefined>; fetch?: typeof fetch; now?: () => number; pause?: (ms: number) => Promise<void> };
const now = (d: ZupDeps) => d.now?.() ?? Date.now();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function app(env: Record<string, string | undefined>) {
  if (!zupConfigured(env)) throw new PortalError("CONFIG_ERROR", "zup_unconfigured", ZUP_MISSING_MESSAGE);
  return { client_id: env["ZUP_CLIENT_ID"]?.trim() ?? "", client_secret: env["ZUP_CLIENT_SECRET"]?.trim() ?? "" };
}
export function zupAuthorizationUrl(state: string, env: Record<string, string | undefined>): string {
  const url = new URL(ZUP_AUTHORIZE);
  url.search = new URLSearchParams({ client_id: app(env).client_id, redirect_uri: ZUP_CALLBACK, response_type: "code", state }).toString();
  return url.toString();
}
export async function createZupState(org: string, actor: string, d: ZupDeps): Promise<string> {
  app(d.env);
  const raw = randomBytes(32).toString("base64url");
  await d.store.insertState({ hash: hash(raw), organizationId: org, createdBy: actor, expiresAt: new Date(now(d) + 600_000).toISOString() });
  return raw;
}
export async function consumeZupState(raw: string | null, d: ZupDeps): Promise<ZupState | null> {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return d.store.consumeState(hash(raw), new Date(now(d)).toISOString());
}
export function zupHttpError(status: number, body: unknown): PortalError {
  let message = status === 401 ? "Autorizarea ZUP nu mai este validă. Reconectează contul ZUP."
    : status === 403 ? "Contul ZUP nu permite accesul la această operație."
    : status === 404 ? "ZUP nu a găsit resursa cerută."
    : status === 422 ? "ZUP a respins datele trimise."
    : status === 429 ? "Prea multe cereri către ZUP. Încearcă din nou în câteva minute."
    : status >= 500 ? "ZUP este temporar indisponibil. Încearcă mai târziu."
    : "ZUP a refuzat cererea. Reia conectarea contului.";
  // Only field names, never provider messages which can echo credentials/PII.
  if (status === 422 && body && typeof body === "object" && "errors" in body) {
    const errors = (body as { errors: unknown }).errors;
    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      const fields = Object.keys(errors).filter(k => /^[a-zA-Z][a-zA-Z0-9_.]{0,60}$/.test(k) && !/token|secret|password|authorization|client_id/i.test(k)).slice(0, 20);
      if (fields.length) message += ` Câmpuri de verificat: ${fields.join(", ")}.`;
    }
  }
  return new PortalError(codeFromHttpStatus(status), `zup_http_${status}`, message);
}
async function request(path: string, init: RequestInit, d: ZupDeps): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZUP_TIMEOUT_MS);
  try {
    const response = await (d.fetch ?? ((input, options) => fetch(input, options)))(new URL(path, ZUP_BASE), { ...init, redirect: "manual", signal: controller.signal });
    const raw = await response.text();
    let body: unknown;
    try { body = JSON.parse(raw); } catch {
      if (!response.ok) throw zupHttpError(response.status, null);
      throw new PortalError("PORTAL_ERROR", "zup_invalid_json", "ZUP a trimis un răspuns care nu poate fi citit.");
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof PortalError) throw error;
    if (controller.signal.aborted) throw new PortalError("TIMEOUT", "zup_timeout", "ZUP nu a răspuns în 30 de secunde.");
    throw new PortalError("NETWORK_ERROR", "zup_network", "ZUP nu a putut fi contactat.");
  } finally { clearTimeout(timer); }
}
async function tokenRequest(path: string, payload: Record<string, string>, d: ZupDeps): Promise<ZupTokens> {
  const response = await request(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ ...payload, ...app(d.env) }) }, d);
  if (response.status < 200 || response.status >= 300) throw zupHttpError(response.status, response.body);
  const body = response.body as Partial<Record<string, unknown>> | null;
  const seconds = Number(body?.["expires_in"]);
  if (!body || typeof body["access_token"] !== "string" || !body["access_token"] || !Number.isFinite(seconds) || seconds <= 0 || seconds > 31_536_000 || typeof body["token_type"] !== "string" || body["token_type"].toLowerCase() !== "bearer") {
    throw new PortalError("AUTH_ERROR", "zup_invalid_token", "ZUP nu a returnat o autorizare validă. Reia conectarea.");
  }
  const issued = now(d);
  const duration = seconds * 1000;
  return { access_token: body["access_token"], refresh_token: typeof body["refresh_token"] === "string" && body["refresh_token"] ? body["refresh_token"] : null, token_type: "Bearer", expires_at: new Date(issued + duration).toISOString(), refresh_after: new Date(issued + duration - Math.min(30_000, duration * 0.2)).toISOString() };
}
export const exchangeZupCode = (code: string, d: ZupDeps) => tokenRequest("oauth/token", { grant_type: "authorization_code", code, redirect_uri: ZUP_CALLBACK }, d);
export const refreshZupTokens = (refresh: string, d: ZupDeps) => tokenRequest("oauth/token/refresh", { grant_type: "refresh_token", refresh_token: refresh }, d);
function decode(row: ZupConnection | null, d: ZupDeps): ZupTokens | null {
  if (!row?.credentials) return null;
  try {
    const plain = d.decrypt(row.credentials);
    const t = plain ? JSON.parse(plain) as ZupTokens : null;
    return t?.access_token && Number.isFinite(Date.parse(t.expires_at)) && Number.isFinite(Date.parse(t.refresh_after)) ? t : null;
  } catch { return null; }
}
export async function saveZupTokens(org: string, tokens: ZupTokens, actor: string | null, d: ZupDeps, expected?: string | null): Promise<void> {
  const row = await d.store.load(org);
  const settings = { ...(row?.settings ?? {}) };
  const previous = settings["oauth"] as Record<string, unknown> | undefined;
  settings["oauth"] = { connected_at: previous?.["connected_at"] ?? new Date(now(d)).toISOString(), refreshed_at: expected ? new Date(now(d)).toISOString() : null, expires_at: tokens.expires_at, has_refresh_token: Boolean(tokens.refresh_token) };
  delete settings["reconnect_required"];
  if (!await d.store.save(org, d.encrypt(JSON.stringify(tokens)), settings, actor, expected)) throw new PortalError("AUTH_ERROR", "zup_connection_changed", "La ZUP, conexiunea s-a schimbat. Reîncearcă testul.");
}
export async function clearZupTokens(org: string, actor: string, d: ZupDeps): Promise<void> {
  const row = await d.store.load(org);
  const settings = { ...(row?.settings ?? {}) }; delete settings["oauth"]; delete settings["reconnect_required"];
  await d.store.save(org, null, settings, actor);
}
export async function getZupAccessToken(org: string, d: ZupDeps, rejected?: string): Promise<string> {
  app(d.env);
  const row = await d.store.load(org); const tokens = decode(row, d);
  if (!tokens) throw new PortalError("AUTH_ERROR", "zup_disconnected", "Contul ZUP al agenției nu este conectat.");
  if (now(d) < Date.parse(tokens.refresh_after) && (!rejected || rejected !== tokens.access_token)) return tokens.access_token;
  const owner = randomUUID();
  let acquired = false;
  for (let i = 0; i < 65; i++) {
    if (await d.store.acquire(org, owner)) { acquired = true; break; }
    await (d.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(500);
    const current = decode(await d.store.load(org), d);
    if (!current) throw new PortalError("AUTH_ERROR", "zup_disconnected", "Contul ZUP a fost deconectat.");
    if (current.access_token !== tokens.access_token && now(d) < Date.parse(current.expires_at)) return current.access_token;
  }
  if (!acquired) throw new PortalError("RATE_LIMIT", "zup_refresh_busy", "Autorizarea ZUP se reînnoiește. Reîncearcă în câteva secunde.");
  try {
    const lockedRow = await d.store.load(org); const current = decode(lockedRow, d);
    if (!current || !lockedRow?.credentials) throw new PortalError("AUTH_ERROR", "zup_disconnected", "Contul ZUP a fost deconectat.");
    if (current.access_token !== tokens.access_token) return current.access_token;
    if (!current.refresh_token) throw new PortalError("AUTH_ERROR", "zup_no_refresh", "Autorizarea ZUP a expirat. Reconectează contul ZUP.");
    const refreshed = await refreshZupTokens(current.refresh_token, d);
    await saveZupTokens(org, { ...refreshed, refresh_token: refreshed.refresh_token ?? current.refresh_token }, null, d, lockedRow.credentials);
    return refreshed.access_token;
  } finally { await d.store.release(org, owner); }
}
export async function testZupConnection(org: string, d: ZupDeps): Promise<{ count: number; message: string }> {
  let token = await getZupAccessToken(org, d);
  let response = await request("anunturi", { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" } }, d);
  if (response.status === 401) {
    token = await getZupAccessToken(org, d, token);
    response = await request("anunturi", { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" } }, d);
  }
  if (response.status < 200 || response.status >= 300) throw zupHttpError(response.status, response.body);
  if (!Array.isArray(response.body) || response.body.some(r => !r || typeof r !== "object" || Array.isArray(r))) throw new PortalError("PORTAL_ERROR", "zup_invalid_list", "ZUP nu a returnat lista de anunțuri în formatul așteptat.");
  return { count: response.body.length, message: `Token valid · Contul ZUP are ${response.body.length} anunțuri.` };
}