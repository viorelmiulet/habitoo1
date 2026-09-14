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
const USER_AGENT = "HabitooProspecting/1.0 (+https://habitoo.ro)";

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

/** Acceptăm doar HTTPS: fără protocoale locale sau nesecurizate. */
function safeUrl(base: string | null, params: Record<string, string> = {}): URL | null {
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
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

async function fetchJson(url: URL): Promise<ProspectFetchResult | unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
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

export const httpFeedProvider: ProspectingSourceProvider = {
  key: HTTP_FEED_PROVIDER_KEY,
  label: "Feed public HTTPS",
  live: true,
  normalize: normalizeProspect,

  async search(criteria, source) {
    if (!source.enabled) {
      return { ok: false, code: "not_configured", message: PROSPECTING_NOT_CONFIGURED_MESSAGE };
    }
    const url = safeUrl(source.baseUrl, criteriaParams(criteria));
    if (!url) {
      return { ok: false, code: "not_configured", message: PROSPECTING_NOT_CONFIGURED_MESSAGE };
    }
    if (source.sourceType === "website" && !(await checkRobots(url))) {
      return {
        ok: false,
        code: "blocked",
        message: "Sursa interzice colectarea automată prin robots.txt.",
      };
    }
    const payload = await fetchJson(url);
    if (isFailure(payload)) return payload;
    const items = itemsOf(payload, source)
      .slice(0, MAX_ITEMS)
      .map((item) => mapFeedItem(item, source))
      .filter((item): item is RawProspect => item !== null);
    return { ok: true, items, fixture: source.configuration["fixture"] === true };
  },

  async fetchListing(reference, source) {
    const url = safeUrl(reference.startsWith("https://") ? reference : source.baseUrl, {});
    if (!url) {
      return { ok: false, code: "not_configured", message: PROSPECTING_NOT_CONFIGURED_MESSAGE };
    }
    const payload = await fetchJson(url);
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
