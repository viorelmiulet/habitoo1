/**
 * Adaptorul Imospot pentru portul `market_query`.
 *
 * Doar interogare, la momentul analizei: nimic nu se stochează în afara
 * analizei salvate. Cereri publice, politicoase și identificate (robots.txt
 * respectat, o cerere pe rând), fără autentificare, fără cookie-uri, fără
 * mascarea identității. Cel mult două pagini de rezultate per interogare.
 * Imaginile și datele de contact nu sunt citite.
 */
import {
  marketQueryFetch,
  type MarketQueryFetchResult,
} from "../fetch.server";
import type {
  MarketQueryAdapter,
  MarketQueryAdapterResult,
  MarketQueryMarketContextData,
  MarketQueryRawComparable,
} from "../port";
import { learnImospotNeighborhoods, resolveImospotLocation } from "./locations";
import {
  parseImospotListings,
  parseImospotMarketContext,
  parseImospotNeighborhoods,
  type ImospotMarketContext,
} from "./parse";
import { buildImospotSearchUrl, IMOSPOT_MAX_PAGES } from "./url";

export const IMOSPOT_SOURCE_KEY = "imospot";

/** De la atâtea comparabile ne oprim: a doua pagină nu mai e necesară. */
export const IMOSPOT_ENOUGH_COMPARABLES = 12;

type FetchPage = (
  url: string,
  options: { timeoutMs?: number },
) => Promise<MarketQueryFetchResult>;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(value);
}

/** Cifrele sursei → rânduri de afișare, etichetate explicit ca fiind ale sursei. */
function marketContextData(
  context: ImospotMarketContext,
  url: string,
  capturedAt: string,
): MarketQueryMarketContextData {
  const lines: { label: string; value: string }[] = [];
  if (context.medianPricePerSqm !== null) {
    lines.push({
      label: "Preț median la vânzare",
      value: `${formatNumber(context.medianPricePerSqm)} €/m²`,
    });
  }
  if (context.medianPrice !== null) {
    lines.push({
      label: "Preț median al unei proprietăți",
      value: `${formatNumber(context.medianPrice)} €`,
    });
  }
  if (context.medianRent !== null) {
    lines.push({
      label: "Chirie mediană",
      value:
        context.rentListings !== null
          ? `${formatNumber(context.medianRent)} €/lună (${formatNumber(context.rentListings)} oferte)`
          : `${formatNumber(context.medianRent)} €/lună`,
    });
  }
  if (context.timeOnMarketText) {
    lines.push({ label: "Timp mediu pe piață", value: context.timeOnMarketText });
  }
  if (context.activeListings !== null) {
    lines.push({
      label: "Proprietăți active la sursă",
      value: formatNumber(context.activeListings),
    });
  }
  if (context.byRooms.length > 0) {
    lines.push({
      label: "Distribuție pe camere",
      value: context.byRooms.map((r) => `${formatNumber(r.count)} × ${r.label}`).join(", "),
    });
  }
  if (context.byType.length > 0) {
    lines.push({
      label: "Distribuție pe tipuri",
      value: context.byType.map((t) => `${t.label} (${formatNumber(t.count)})`).join(", "),
    });
  }

  const place = context.cityLabel ? ` — ${context.cityLabel}` : "";
  return {
    title: `Cifre publicate de Imospot${place}`,
    lines,
    note: context.note,
    url,
    capturedAt,
  };
}

function toRaw(
  listing: ReturnType<typeof parseImospotListings>[number],
  baseUrl: string,
): MarketQueryRawComparable {
  const url = listing.url
    ? listing.url.startsWith("http")
      ? listing.url
      : `${baseUrl.replace(/\/+$/, "")}${listing.url.startsWith("/") ? "" : "/"}${listing.url}`
    : null;
  return {
    price: listing.price,
    currency: listing.currency,
    area: listing.area,
    rooms: listing.rooms,
    locality: listing.locality,
    zone: listing.zone,
    latitude: listing.latitude,
    longitude: listing.longitude,
    listedAt: listing.listedAt,
    url,
  };
}

export function createImospotAdapter(deps: { fetchPage?: FetchPage } = {}): MarketQueryAdapter {
  const fetchPage: FetchPage = deps.fetchPage ?? marketQueryFetch;

  return {
    key: IMOSPOT_SOURCE_KEY,
    async query({ criteria, source, signal }): Promise<MarketQueryAdapterResult> {
      const location = resolveImospotLocation({ city: criteria.city, zone: criteria.zone });
      if (!location) {
        // Fără corespondent în hartă nu se ghicește niciun slug și nu se cere nimic.
        throw new Error("Localitatea nu are corespondent în harta Imospot.");
      }

      const items: MarketQueryRawComparable[] = [];
      const seenIds = new Set<string>();
      const requestedUrls: string[] = [];
      let marketContext: MarketQueryMarketContextData | null = null;
      const now = new Date();

      for (let page = 1; page <= IMOSPOT_MAX_PAGES; page += 1) {
        if (signal.aborted) throw new Error("Interogare întreruptă.");
        const url = buildImospotSearchUrl({
          baseUrl: source.baseUrl,
          location,
          criteria,
          page,
        });
        requestedUrls.push(url);

        const aborted = new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Interogare întreruptă.")), {
            once: true,
          });
        });
        const result = await Promise.race([
          fetchPage(url, { timeoutMs: source.timeoutMs }),
          aborted,
        ]);

        if (result.error) throw new Error(result.error);
        if (result.status === 403 || result.status === 429) {
          throw new Error(`Sursa a refuzat cererea (${result.status}).`);
        }
        if (result.status !== 200 || !result.body) {
          throw new Error(`Răspuns neutilizabil de la sursă (${result.status}).`);
        }

        const listings = parseImospotListings(result.body, now);
        for (const listing of listings) {
          if (seenIds.has(listing.listingId)) continue;
          seenIds.add(listing.listingId);
          items.push(toRaw(listing, source.baseUrl));
        }

        // Cartierele publicate de pagină intră în hartă; nu se ghicește nimic.
        learnImospotNeighborhoods(parseImospotNeighborhoods(result.body));

        if (page === 1) {
          const context = parseImospotMarketContext(result.body);
          if (context) marketContext = marketContextData(context, url, now.toISOString());
        }

        // Ne oprim mai devreme când avem destule comparabile sau pagina e goală.
        if (listings.length === 0) break;
        if (items.length >= IMOSPOT_ENOUGH_COMPARABLES) break;
      }

      return { items, marketContext, requestedUrls };
    },
  };
}

export const imospotAdapter = createImospotAdapter();
