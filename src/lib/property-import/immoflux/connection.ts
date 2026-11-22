/**
 * IMMOFLUX API v2: `https://{subdomeniu}.immoflux.ro/api/v2/...?token=...`.
 * Habitoo face EXCLUSIV cereri GET; tokenul nu apare niciodată în loguri, erori sau rapoarte.
 */
export type ImmofluxConnectionView = { organizationId: string; subdomain: string; enabled: boolean; configured: boolean; tokenLast4: string | null };

/** Marcaj intern în coloana `slug`: configurarea folosește API v2. */
export const IMMOFLUX_V2_MARKER = "api-v2";
export const IMMOFLUX_MAX_PAGES = 500;

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Acceptă `agentie`, `agentie.immoflux.ro` sau adresa întreagă lipită; întoarce doar subdomeniul. */
export function normalizeImmofluxSubdomain(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (value.includes("/") || value.includes(".")) {
    try { value = new URL(value.includes("://") ? value : `https://${value}`).hostname; }
    catch { throw new Error("Subdomeniu IMMOFLUX invalid."); }
    if (!value.endsWith(".immoflux.ro")) throw new Error("Adresa trebuie să fie de forma numeagentie.immoflux.ro.");
    value = value.slice(0, -".immoflux.ro".length);
  }
  if (!SUBDOMAIN_RE.test(value)) throw new Error("Subdomeniu invalid: folosește doar litere mici, cifre și cratimă.");
  return value;
}

export const immofluxHostOf = (subdomain: string) => `${normalizeImmofluxSubdomain(subdomain)}.immoflux.ro`;

/** Subdomeniul dintr-un host salvat; gol dacă hostul nu e de forma `x.immoflux.ro` (configurare veche). */
export function subdomainFromHost(host: string | null | undefined): string {
  const m = (host ?? "").match(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.immoflux\.ro$/);
  return m ? m[1]! : "";
}

export function immofluxV2Url(subdomain: string, path: string, token: string, params: Record<string, string | number> = {}): string {
  const url = new URL(`https://${immofluxHostOf(subdomain)}/api/v2/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("token", token);
  return url.toString();
}

/** Maschează tokenul (în clar, codificat sau ca parametru `token=`) în orice text. */
export function maskImmofluxToken(text: string, token?: string | null): string {
  let out = text;
  if (token) for (const t of new Set([token, encodeURIComponent(token)])) if (t) out = out.split(t).join("***");
  return out.replace(/([?&]token=)[^&\s"']*/gi, "$1***");
}

export function immofluxHttpMessage(status: number): string {
  if (status === 401 || status === 403) return `Token API IMMOFLUX invalid (HTTP ${status}).`;
  if (status === 404) return "Subdomeniu IMMOFLUX greșit (HTTP 404).";
  return `IMMOFLUX a răspuns cu HTTP ${status}.`;
}

/** `detail` = primele 300 de caractere din răspunsul IMMOFLUX, cu tokenul mascat. */
export class ImmofluxHttpError extends Error { constructor(public status: number, public detail: string = "") { super(immofluxHttpMessage(status)); } }

const MAX_BYTES = 8 * 1024 * 1024;

/** Singurul punct de acces la rețea către IMMOFLUX: mereu `GET`, fără redirecționări, erori fără URL. */
export async function immofluxGet(url: string, token: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
  } catch {
    throw new Error("IMMOFLUX nu a răspuns în timp util.");
  }
  if (!response.ok) {
    let body = "";
    try { body = (await response.text()).slice(0, 2000); } catch { /* ignorat */ }
    throw new ImmofluxHttpError(response.status, maskImmofluxToken(body, token).replace(/\s+/g, " ").trim().slice(0, 300));
  }
  let text: string;
  try { text = await response.text(); } catch { throw new Error("Răspunsul IMMOFLUX nu a putut fi citit."); }
  if (text.length > MAX_BYTES) throw new Error("Răspuns IMMOFLUX prea mare.");
  try { return JSON.parse(text); } catch { throw new Error(maskImmofluxToken("Răspuns IMMOFLUX invalid (nu este JSON).", token)); }
}

/** Numărul total de anunțuri, dacă răspunsul îl conține. */
export function totalOf(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const meta = b["meta"] && typeof b["meta"] === "object" ? (b["meta"] as Record<string, unknown>) : {};
  for (const v of [b["total"], meta["total"], b["count"]]) {
    const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
    if (typeof n === "number" && Number.isSafeInteger(n) && n >= 0) return n;
  }
  return null;
}

export async function testImmofluxPull(subdomain: string, token: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; message: string; httpStatus: number | null; total: number | null }> {
  try {
    const body = await immofluxGet(immofluxV2Url(subdomain, "properties", token), token, fetchImpl);
    const total = totalOf(body);
    return { ok: true, httpStatus: 200, total, message: total === null ? "OK" : `OK, ${total} anunțuri` };
  } catch (e) {
    if (e instanceof ImmofluxHttpError) return { ok: false, httpStatus: e.status, total: null, message: e.message };
    return { ok: false, httpStatus: null, total: null, message: maskImmofluxToken(e instanceof Error ? e.message : "Conexiune nereușită.", token) };
  }
}
