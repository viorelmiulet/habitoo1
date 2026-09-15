/**
 * Provider generic pentru surse publice de tip feed (Stage 13).
 *
 * Funcționează DOAR cu surse configurate explicit de agenție, prin HTTPS, care
 * expun un feed JSON public. Nu ocolim CAPTCHA, autentificări, paywall-uri sau
 * mecanisme anti-bot; nu trimitem credențiale; respectăm robots.txt pentru
 * sursele de tip website. Fără `base_url` sau cu sursa dezactivată, providerul
 * răspunde controlat `not_configured` — nu inventează date de piață.
 */
import { normalizeProspect } from "../normalize";
import {
  PROSPECTING_NOT_CONFIGURED_MESSAGE,
  type ProspectFetchResult,
  type ProspectSearchCriteria,
  type ProspectSource,
  type ProspectingSourceProvider,
  type RawProspect,
  type SourceHealthResult,
} from "../types";

export const HTTP_FEED_PROVIDER_KEY = "http_feed";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_ITEMS = 50;
const MAX_PAGES = 5;
const RATE_LIMIT_PER_MINUTE = 30;
const USER_AGENT = "HabitooProspecting/1.0 (+https://habitoo.ro)";

/** Prefix obligatoriu pentru secretele de sursă: nicio altă variabilă nu poate fi citită. */
export const PROSPECTING_SECRET_PREFIX = "PROSPECTING_";

/**
 * Autentificarea sursei, dacă feed-ul o cere. Configurația păstrează DOAR
 * numele secretului, niciodată valoarea; valoarea este citită server-side și
 * nu ajunge în interfață, în audit sau în loguri.
 */
export function feedAuthHeaders(
  source: ProspectSource,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const name = source.configuration["authSecretName"];
  if (typeof name !== "string" || !name.startsWith(PROSPECTING_SECRET_PREFIX)) return {};
  const value = env[name];
  if (!value) return {};
  const scheme =
    typeof source.configuration["authScheme"] === "string"
      ? String(source.configuration["authScheme"])
      : "bearer";
  if (scheme === "header") {
    const header =
      typeof source.configuration["authHeader"] === "string"
        ? String(source.configuration["authHeader"])
        : "X-Api-Key";
    return { [header]: value };
  }
  return { Authorization: `Bearer ${value}` };
}

/** Rate limit per sursă: protejează atât Habitoo, cât și sursa externă. */
const rateWindows = new Map<string, number[]>();

export function feedRateLimitAllows(
  key: string,
  now: number = Date.now(),
  limit: number = RATE_LIMIT_PER_MINUTE,
): boolean {
  const hits = (rateWindows.get(key) ?? []).filter((time) => now - time < 60_000);
  if (hits.length >= limit) {
    rateWindows.set(key, hits);
    return false;
  }
  hits.push(now);
  rateWindows.set(key, hits);
  return true;
}

export function resetFeedRateLimit(): void {
  rateWindows.clear();
}

/** Host-uri interne: blocate explicit ca protecție SSRF. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host === "0.0.0.0" || host === "metadata.google.internal") return true;
  return false;
}

/**
 * Acceptăm doar HTTPS, host-uri publice și — dacă sursa are `allowedHosts` —
 * doar host-urile din allowlist. Astfel un URL din configurație nu poate ținti
 * rețeaua internă (SSRF).
 */
export function safeFeedUrl(
  base: string | null,
  params: Record<string, string> = {},
  allowedHosts: string[] = [],
): URL | null {
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (isPrivateHost(url.hostname)) return null;
  if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function allowedHostsOf(source: ProspectSource): string[] {
  const raw = source.configuration["allowedHosts"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

function safeUrl(
  base: string | null,
  params: Record<string, string> = {},
  source?: ProspectSource,
): URL | null {
  return safeFeedUrl(base, params, source ? allowedHostsOf(source) : []);
}


function criteriaParams(criteria: ProspectSearchCriteria): Record<string, string> {
  const params: Record<string, string> = {};
  if (criteria.transactionType) params["transaction"] = criteria.transactionType;
  if (criteria.propertyType) params["type"] = criteria.propertyType;
  if (criteria.county) params["county"] = criteria.county;
  if (criteria.city) params["city"] = criteria.city;
  if (criteria.zone) params["zone"] = criteria.zone;
  if (criteria.priceMin !== null) params["price_min"] = String(criteria.priceMin);
  if (criteria.priceMax !== null) params["price_max"] = String(criteria.priceMax);
  if (criteria.roomsMin !== null) params["rooms_min"] = String(criteria.roomsMin);
  if (criteria.roomsMax !== null) params["rooms_max"] = String(criteria.roomsMax);
  if (criteria.keywords.length > 0) params["q"] = criteria.keywords.join(" ");
  return params;
}


/** Verificare robots.txt: dacă „Disallow: /" apare pentru toți, nu colectăm. */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.trim().toLowerCase());
  let inGlobal = false;
  for (const line of lines) {
    if (line.startsWith("user-agent:")) {
      inGlobal = line.slice("user-agent:".length).trim() === "*";
      continue;
    }
    if (!inGlobal || !line.startsWith("disallow:")) continue;
    const rule = line.slice("disallow:".length).trim();
    if (rule === "") continue;
    if (path.startsWith(rule)) return false;
  }
  return true;
}

async function checkRobots(url: URL): Promise<boolean> {
  try {
    const response = await fetch(new URL("/robots.txt", url.origin), {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return true;
    return robotsAllows(await response.text(), url.pathname);
  } catch {
    return true;
  }
}

/** Mapează un obiect din feed în `RawProspect`, folosind maparea configurată. */
export function mapFeedItem(
  item: Record<string, unknown>,
  source: ProspectSource,
): RawProspect | null {
  const mapping = (source.configuration["mapping"] ?? {}) as Record<string, string>;
  const pick = (field: string, fallbacks: string[]): unknown => {
    const mapped = mapping[field];
    if (mapped && item[mapped] !== undefined) return item[mapped];
    for (const key of fallbacks) if (item[key] !== undefined) return item[key];
    return undefined;
  };

  const title = pick("title", ["title", "titlu", "name"]);
  if (typeof title !== "string" || title.trim() === "") return null;

  const externalId = pick("externalId", ["id", "external_id", "listingId"]);
  const url = pick("url", ["url", "link", "source_url"]);

  return {
    sourceKey: source.providerKey,
    externalId: externalId === undefined || externalId === null ? null : String(externalId),
    url: typeof url === "string" ? url : null,
    title,
    description: typeof pick("description", ["description", "descriere", "text"]) === "string"
      ? String(pick("description", ["description", "descriere", "text"]))
      : null,
    fields: {
      price: pick("price", ["price", "pret"]),
      currency: pick("currency", ["currency", "moneda"]),
      rooms: pick("rooms", ["rooms", "camere"]),
      surfaceUseful: pick("surfaceUseful", ["surface", "suprafata", "surface_useful"]),
      surfaceBuilt: pick("surfaceBuilt", ["surface_built"]),
      floor: pick("floor", ["floor", "etaj"]),
      totalFloors: pick("totalFloors", ["total_floors"]),
      yearBuilt: pick("yearBuilt", ["year_built", "an_construcite", "an"]),
      city: pick("city", ["city", "oras", "localitate"]),
      county: pick("county", ["county", "judet"]),
      zone: pick("zone", ["zone", "zona", "cartier"]),
      address: pick("address", ["address", "adresa"]),
      propertyType: pick("propertyType", ["property_type", "tip"]),
      transactionType: pick("transactionType", ["transaction", "tranzactie"]),
      sellerName: pick("sellerName", ["seller", "owner", "contact_name"]),
      sellerPhone: pick("sellerPhone", ["phone", "telefon", "contact_phone"]),
      publishedAt: pick("publishedAt", ["published_at", "date", "data"]),
      images: pick("images", ["images", "photos"]),
      features: pick("features", ["features", "dotari"]),
    },
    fetchedAt: new Date().toISOString(),
    fixture: source.configuration["fixture"] === true,
  };
}

function itemsOf(payload: unknown, source: ProspectSource): Record<string, unknown>[] {
  const path = typeof source.configuration["itemsPath"] === "string"
    ? String(source.configuration["itemsPath"])
    : null;
  let node: unknown = payload;
  if (path) {
    for (const segment of path.split(".")) {
      node = (node as Record<string, unknown> | null)?.[segment];
    }
  } else if (!Array.isArray(payload)) {
    node =
      (payload as Record<string, unknown> | null)?.["items"] ??
      (payload as Record<string, unknown> | null)?.["data"] ??
      (payload as Record<string, unknown> | null)?.["results"];
  }
  return Array.isArray(node)
    ? node.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}

async function fetchJson(
  url: URL,
  source: ProspectSource,
): Promise<ProspectFetchResult | unknown> {
  if (!feedRateLimitAllows(`${source.id}:${url.origin}`)) {
    return {
      ok: false as const,
      code: "blocked" as const,
      message: "Prea multe colectări pentru această sursă. Încearcă din nou într-un minut.",
    };
  }
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...feedAuthHeaders(source),
      },
    });
  } catch {
    return {
      ok: false as const,
      code: "failed" as const,
      message: "Sursa nu a putut fi contactată. Încearcă din nou mai târziu.",
    };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return {
      ok: false as const,
      code: "blocked" as const,
      message: "Sursa nu permite colectarea automată pentru această configurație.",
    };
  }
  if (!response.ok) {
    return {
      ok: false as const,
      code: "failed" as const,
      message: `Sursa a răspuns cu o eroare (${response.status}).`,
    };
  }
  try {
    return await response.json();
  } catch {
    return {
      ok: false as const,
      code: "failed" as const,
      message: "Sursa nu a returnat un feed JSON valid.",
    };
  }
}

function isFailure(value: unknown): value is Extract<ProspectFetchResult, { ok: false }> {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}

/** Paginare opțională: se activează doar dacă sursa o declară în configurație. */
function paginationOf(source: ProspectSource): { param: string; sizeParam: string | null; size: number; start: number } | null {
  const config = source.configuration["pagination"];
  if (!config || typeof config !== "object") return null;
  const raw = config as Record<string, unknown>;
  const param = typeof raw["pageParam"] === "string" ? String(raw["pageParam"]) : "page";
  const sizeParam = typeof raw["sizeParam"] === "string" ? String(raw["sizeParam"]) : null;
  const size = Number(raw["pageSize"]);
  const start = Number(raw["startPage"]);
  return {
    param,
    sizeParam,
    size: Number.isFinite(size) && size > 0 ? Math.min(Math.trunc(size), MAX_ITEMS) : 25,
    start: Number.isFinite(start) ? Math.trunc(start) : 1,
  };
}

export const httpFeedProvider: ProspectingSourceProvider = {
  key: HTTP_FEED_PROVIDER_KEY,
  label: "Feed public HTTPS",
  live: true,
  availability: "live",
  capabilities: ["search", "fetch_listing", "pagination", "health_check"],
  normalize: normalizeProspect,

  async search(criteria, source) {
    if (!source.enabled) {
      return { ok: false, code: "not_configured", message: PROSPECTING_NOT_CONFIGURED_MESSAGE };
    }
    const baseParams = criteriaParams(criteria);
    const firstUrl = safeUrl(source.baseUrl, baseParams, source);
    if (!firstUrl) {
      return { ok: false, code: "not_configured", message: PROSPECTING_NOT_CONFIGURED_MESSAGE };
    }
    if (source.sourceType === "website" && !(await checkRobots(firstUrl))) {
      return {
        ok: false,
        code: "blocked",
        message: "Sursa interzice colectarea automată prin robots.txt.",
      };
    }

    const pagination = paginationOf(source);
    const fixture = source.configuration["fixture"] === true;
    const collected: RawProspect[] = [];
    let pagesFetched = 0;

    for (let index = 0; index < (pagination ? MAX_PAGES : 1); index += 1) {
      const params = { ...baseParams };
      if (pagination) {
        params[pagination.param] = String(pagination.start + index);
        if (pagination.sizeParam) params[pagination.sizeParam] = String(pagination.size);
      }
      const url = safeUrl(source.baseUrl, params, source);
      if (!url) break;
      const payload = await fetchJson(url, source);
      if (isFailure(payload)) {
        if (collected.length > 0) break;
        return payload;
      }
      pagesFetched += 1;
      const pageItems = itemsOf(payload, source)
        .map((item) => mapFeedItem(item, source))
        .filter((item): item is RawProspect => item !== null);
      collected.push(...pageItems);
      if (!pagination || pageItems.length === 0 || collected.length >= MAX_ITEMS) break;
    }

    return { ok: true, items: collected.slice(0, MAX_ITEMS), fixture, pagesFetched };
  },

  async fetchListing(reference, source) {
    const url = safeUrl(reference.startsWith("https://") ? reference : source.baseUrl, {}, source);
    if (!url) {
      return { ok: false, code: "not_configured", message: PROSPECTING_NOT_CONFIGURED_MESSAGE };
    }
    const payload = await fetchJson(url, source);
    if (isFailure(payload)) return payload;
    const single = mapFeedItem(payload as Record<string, unknown>, source);
    return single
      ? { ok: true, items: [single], fixture: source.configuration["fixture"] === true }
      : { ok: false, code: "failed", message: "Anunțul nu a putut fi interpretat." };
  },


  async healthCheck(source) {
    const checkedAt = new Date().toISOString();
    const url = safeUrl(source.baseUrl, {});
    if (!source.enabled || !url) {
      return {
        ok: false,
        code: "not_configured",
        message: PROSPECTING_NOT_CONFIGURED_MESSAGE,
        checkedAt,
      };
    }
    const payload = await fetchJson(url);
    if (isFailure(payload)) {
      return {
        ok: false,
        code: payload.code === "blocked" ? "blocked" : "unreachable",
        message: payload.message,
        checkedAt,
      };
    }
    return { ok: true, code: "ok", message: "Sursa răspunde corect.", checkedAt };
  },
};
