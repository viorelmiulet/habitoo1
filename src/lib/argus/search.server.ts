/**
 * Căutarea Argus (server-only): traduce filtrele interfeței în parametrii
 * API, normalizează răspunsurile și nu salvează nimic în baza de date.
 * Telefoanele vin doar prin getArgusPropertyContact (/properties/contact).
 */
import { argusCall, type ArgusCallOptions } from "./connection.server";
import type { ArgusFetch } from "./client.server";
import {
  buildArgusSearchBody,
  normalizeArgusContact,
  normalizeArgusDetail,
  normalizeArgusImages,
  normalizeArgusPlacesPage,
  normalizeArgusSearch,
  type ArgusPlace,
  type ArgusPropertyDetailData,
  type ArgusSearchInput,
  type ArgusSearchResult,
} from "./search.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type CallOpts = { clientIp?: string | null; fetchFn?: ArgusFetch };

function call<T>(db: Db, orgId: string, opts: ArgusCallOptions): Promise<T> {
  return argusCall<T>(db, orgId, opts);
}

/** Căutare live la Argus; rezultatul nu se salvează în baza de date. */
export async function searchArgusProperties(
  db: Db,
  orgId: string,
  input: ArgusSearchInput,
  extra: CallOpts = {},
): Promise<ArgusSearchResult> {
  const raw = await call<unknown>(db, orgId, {
    path: "/properties/search",
    body: buildArgusSearchBody(input),
    clientIp: extra.clientIp,
    fetchFn: extra.fetchFn,
  });
  return normalizeArgusSearch(raw);
}

/** Imaginile unui anunț (folosit și de carduri, și de detaliu). */
export async function getArgusPropertyImages(
  db: Db,
  orgId: string,
  propertyId: string,
  extra: CallOpts = {},
): Promise<ReturnType<typeof normalizeArgusImages>> {
  const raw = await call<unknown>(db, orgId, {
    path: "/properties/images",
    method: "GET",
    body: { property_id: propertyId },
    clientIp: extra.clientIp,
    fetchFn: extra.fetchFn,
  });
  return normalizeArgusImages(raw);
}

/**
 * Detaliul unui anunț: descriere, poze, detalii, poziție, link original.
 * Dacă detaliul nu include pozele deși anunțul are, se mai face o cerere
 * /properties/images. Telefoanele nu se includ aici.
 */
export async function getArgusPropertyDetail(
  db: Db,
  orgId: string,
  propertyId: string,
  extra: CallOpts = {},
): Promise<ArgusPropertyDetailData | null> {
  const raw = await call<unknown>(db, orgId, {
    path: "/properties/detail",
    body: { property_id: propertyId },
    clientIp: extra.clientIp,
    fetchFn: extra.fetchFn,
  });
  let images = normalizeArgusImages(raw);
  const hasImage =
    raw && typeof raw === "object" && (raw as Record<string, unknown>)["has_image"] === true;
  if (hasImage && images.length === 0) {
    images = await getArgusPropertyImages(db, orgId, propertyId, extra);
  }
  return normalizeArgusDetail(raw, images);
}

/** Telefonul se cere explicit, doar la apăsarea „Arată telefon”. */
export async function getArgusPropertyContact(
  db: Db,
  orgId: string,
  propertyId: string,
  extra: CallOpts = {},
): Promise<{ phones: string[] }> {
  const raw = await call<unknown>(db, orgId, {
    path: "/properties/contact",
    method: "GET",
    body: { property_id: propertyId },
    clientIp: extra.clientIp,
    fetchFn: extra.fetchFn,
  });
  return normalizeArgusContact(raw);
}

export type ArgusPlaceKind = "counties" | "cities" | "areas";

const PLACE_PATHS: Record<ArgusPlaceKind, string> = {
  counties: "/tools/localisation/counties",
  cities: "/tools/localisation/cities",
  areas: "/tools/localisation/areas",
};

/** O pagină de localizare consumă o cerere; limităm totalul pe interogare. */
const MAX_PLACE_PAGES = 10;

/**
 * Listează județe / orașe / zone din nomenclatorul Argus, mergând prin
 * pagini până la capăt (sau la limita de siguranță). `query` filtrează la
 * serverul Argus, ca să nu descărcăm mii de localități.
 */
export async function listArgusPlaces(
  db: Db,
  orgId: string,
  kind: ArgusPlaceKind,
  filter: { countyIds?: number[]; cityIds?: number[]; query?: string } = {},
  extra: CallOpts = {},
): Promise<{ options: ArgusPlace[]; truncated: boolean }> {
  const options: ArgusPlace[] = [];
  const seen = new Set<number>();
  let page = 1;
  let truncated = false;
  for (;;) {
    const body: Record<string, unknown> = { page };
    if (filter.query) body["query"] = filter.query;
    if (kind === "cities" && filter.countyIds?.length) body["counties"] = filter.countyIds;
    if (kind === "areas" && filter.cityIds?.length) body["cities"] = filter.cityIds;
    const raw = await call<unknown>(db, orgId, {
      path: PLACE_PATHS[kind],
      body,
      clientIp: extra.clientIp,
      fetchFn: extra.fetchFn,
    });
    const parsed = normalizeArgusPlacesPage(raw);
    for (const place of parsed.options) {
      if (!seen.has(place.id)) {
        seen.add(place.id);
        options.push(place);
      }
    }
    if (parsed.nextPage === null || parsed.options.length === 0) break;
    if (page >= MAX_PLACE_PAGES) {
      truncated = true;
      break;
    }
    page = parsed.nextPage;
  }
  return { options, truncated };
}
