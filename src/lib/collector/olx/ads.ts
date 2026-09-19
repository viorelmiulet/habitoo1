/**
 * Citirea câmpurilor unui anunț OLX din JSON-ul încorporat (logică pură).
 *
 * Nu se citește, nu se interpretează și nu se salvează NICIUN număr de telefon:
 * modulul nu atinge niciun câmp de contact.
 *
 * Proprietar vs agenție vine EXCLUSIV din câmpul `isBusiness` al anunțului:
 * false = proprietar, true = agenție, lipsă = necunoscut. Nu există nicio
 * regulă după numărul de anunțuri.
 */
import type { CollectorPropertyType } from "./mapping";

export type OlxSellerType = "owner" | "agency" | "unknown";

export type OlxAdLocation = {
  cityName: string | null;
  cityId: number | null;
  regionName: string | null;
  regionId: number | null;
  districtName: string | null;
  districtId: number | null;
  pathName: string | null;
};

export type OlxAdPoint = {
  lat: number | null;
  lon: number | null;
  /** Raza declarată de OLX: punctul NU este exact și nu se prezintă ca exact. */
  radiusMeters: number | null;
  precise: false;
};

export type OlxAdFields = {
  sourceItemId: string;
  url: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  createdTime: string | null;
  lastRefreshTime: string | null;
  status: string | null;
  isBusiness: boolean | null;
  isPromoted: boolean | null;
  sellerType: OlxSellerType;
  photos: string[];
  location: OlxAdLocation;
  point: OlxAdPoint;
  categoryId: number | null;
  /** Parametrii publicați, pe cheie. */
  params: {
    area: number | null;
    floor: string | null;
    construction: string | null;
    layout: string | null;
  };
  propertyType: CollectorPropertyType;
};

export type OlxAdResult = { ok: true; fields: OlxAdFields } | { ok: false; reason: string };

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** `isBusiness` declarat de anunț — singurul semnal folosit. */
export function olxSellerFromIsBusiness(isBusiness: boolean | null | undefined): OlxSellerType {
  if (isBusiness === true) return "agency";
  if (isBusiness === false) return "owner";
  return "unknown";
}

function photosOf(ad: Record<string, unknown>): string[] {
  const list = Array.isArray(ad["photos"]) ? (ad["photos"] as unknown[]) : [];
  const out: string[] = [];
  for (const entry of list) {
    // Doar adrese: nimic nu se descarcă niciodată.
    const url =
      typeof entry === "string"
        ? entry
        : (str(obj(entry)?.["link"]) ?? str(obj(entry)?.["url"]) ?? null);
    if (!url) continue;
    const clean = url.replace(/\{width\}/g, "1000").replace(/\{height\}/g, "800");
    if (/^https?:\/\//i.test(clean) && !out.includes(clean)) out.push(clean);
  }
  return out;
}

function paramsByKey(ad: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const list = Array.isArray(ad["params"]) ? (ad["params"] as unknown[]) : [];
  for (const entry of list) {
    const param = obj(entry);
    const key = str(param?.["key"]);
    if (param && key) map.set(key, param);
  }
  return map;
}

function paramValue(param: Record<string, unknown> | undefined): string | null {
  if (!param) return null;
  const value = obj(param["value"]);
  return str(value?.["label"]) ?? str(value?.["key"]) ?? str(param["value"]);
}

function paramNumber(param: Record<string, unknown> | undefined): number | null {
  if (!param) return null;
  const value = obj(param["value"]);
  return num(value?.["normalizedValue"]) ?? num(value?.["key"]) ?? num(param["value"]);
}

function locationOf(ad: Record<string, unknown>): OlxAdLocation {
  const location = obj(ad["location"]) ?? {};
  const city = obj(location["city"]) ?? {};
  const region = obj(location["region"]) ?? {};
  const district = obj(location["district"]) ?? {};
  return {
    cityName: str(city["name"]),
    cityId: num(city["id"]),
    regionName: str(region["name"]),
    regionId: num(region["id"]),
    districtName: str(district["name"]),
    districtId: num(district["id"]),
    pathName: str(city["normalized_name"]) ?? str(location["pathName"]),
  };
}

function pointOf(ad: Record<string, unknown>): OlxAdPoint {
  const map = obj(ad["map"]) ?? {};
  return {
    lat: num(map["lat"]),
    lon: num(map["lon"]),
    radiusMeters: num(map["radius"]),
    precise: false,
  };
}

/**
 * Un anunț → câmpurile noastre. Tipul proprietății vine din categoria de
 * căutare (harta `categoryTypes`), niciodată din titlu.
 */
export function readOlxAd(
  ad: unknown,
  options: { categoryTypes: Record<string, CollectorPropertyType> },
): OlxAdResult {
  const record = obj(ad);
  if (!record) return { ok: false, reason: "Anunțul nu este un obiect JSON" };

  const sourceItemId = str(record["id"]);
  const url = str(record["url"]);
  const title = str(record["title"]);
  if (!sourceItemId) return { ok: false, reason: "Anunțul nu are identificator (id)" };
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: `Anunțul ${sourceItemId} nu are adresă publică` };
  }
  if (!title) return { ok: false, reason: `Anunțul ${sourceItemId} nu are titlu` };

  const priceParam = obj(obj(record["price"])?.["regularPrice"]);
  const params = paramsByKey(record);
  const categoryId = num(obj(record["category"])?.["id"]);
  const isBusiness = bool(record["isBusiness"]);

  return {
    ok: true,
    fields: {
      sourceItemId,
      url,
      title,
      description: str(record["description"]),
      price: num(priceParam?.["value"]),
      currency: str(priceParam?.["currencyCode"]),
      createdTime: str(record["createdTime"]),
      lastRefreshTime: str(record["lastRefreshTime"]),
      status: str(record["status"]),
      isBusiness,
      isPromoted: bool(record["isPromoted"]),
      sellerType: olxSellerFromIsBusiness(isBusiness),
      photos: photosOf(record),
      location: locationOf(record),
      point: pointOf(record),
      categoryId,
      params: {
        area: paramNumber(params.get("m")),
        floor: paramValue(params.get("floor")),
        construction: paramValue(params.get("constructie")),
        layout: paramValue(params.get("compartimentare")),
      },
      propertyType:
        (categoryId !== null ? options.categoryTypes[String(categoryId)] : undefined) ??
        "necunoscut",
    },
  };
}
