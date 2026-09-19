/**
 * Adaptorul OLX — DOAR pagini publice.
 *
 * Fără autentificare, fără cookie-uri păstrate, fără proxy, fără mascarea
 * identității. Nu citește, nu salvează și nu hash-uiește NICIUN număr de
 * telefon: nu există nicio referire la telefon în acest modul.
 *
 * Tot ce ține de markup stă în `selectors.ts`; maparea și clasificarea în
 * `mapping.ts`. Când markup-ul se schimbă, itemul e raportat ca eșec de
 * citire și rularea continuă, fără rânduri incomplete.
 */
import type { CollectorAdapter, CollectorParsedItem, CollectorParseFailure } from "../adapters";
import {
  classifyOlxSeller,
  localityKey,
  mapOlxPropertyType,
  olxPageUrl,
  parseOlxConfig,
  resolveZone,
  type LocalityIndexEntry,
} from "./mapping";
import { olxFieldsFromCard, readOlxCard, splitOlxCards } from "./selectors";

export const OLX_SOURCE_KEY = "olx";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PreparedIndex = { localities: Map<string, LocalityIndexEntry> };

/** Nomenclatorul propriu: potrivire exactă pe numele orașelor configurate. */
async function prepareLocalities(admin: any, config: unknown): Promise<PreparedIndex> {
  const index = new Map<string, LocalityIndexEntry>();
  const parsed = parseOlxConfig(config);
  if (parsed.cities.length === 0 || !admin?.from) return { localities: index };

  const keys = parsed.cities.map((city) => localityKey(city.label));
  const { data: localities } = await admin
    .from("ro_localities")
    .select("id, name, normalized_name, county_id")
    .in("normalized_name", keys);
  const countyIds = [
    ...new Set(((localities ?? []) as any[]).map((row) => row.county_id).filter(Boolean)),
  ];
  const countyNames = new Map<string, string>();
  if (countyIds.length > 0) {
    const { data: counties } = await admin.from("ro_counties").select("id, name").in("id", countyIds);
    for (const county of (counties ?? []) as any[]) countyNames.set(county.id, county.name);
  }
  for (const row of (localities ?? []) as any[]) {
    index.set(localityKey(row.normalized_name ?? row.name), {
      locality: row.name,
      county: countyNames.get(row.county_id) ?? "",
      localityId: row.id ?? null,
    });
  }
  return { localities: index };
}

export const olxAdapter: CollectorAdapter = {
  key: OLX_SOURCE_KEY,

  prepare: async ({ admin, config }) => prepareLocalities(admin, config),

  pageUrl: ({ baseUrl, config, page }) => olxPageUrl(baseUrl, parseOlxConfig(config), page),

  parsePage: ({ url, body, baseUrl, config, prepared }) => {
    void config;
    const index = (prepared as PreparedIndex | undefined)?.localities ?? new Map();
    const items: CollectorParsedItem[] = [];
    const failures: CollectorParseFailure[] = [];

    for (const card of splitOlxCards(body)) {
      const raw = readOlxCard(card, baseUrl || url);
      const outcome = olxFieldsFromCard(raw);
      if ("failure" in outcome) {
        failures.push({ url: raw.url ?? url, reason: outcome.failure.reason });
        continue;
      }
      const fields = outcome.fields;
      const seller = classifyOlxSeller(fields.sellerBadgeText);
      const zone = resolveZone(fields.cityText, index);
      const propertyType = mapOlxPropertyType(fields.categoryText, fields.rooms, fields.title);

      items.push({
        url: fields.url,
        sourceItemId: fields.sourceItemId,
        inferredType: seller.inferredType,
        imageUrls: fields.imageUrls,
        signals: seller.signals,
        declaredAgency: seller.inferredType === "agency" ? true : null,
        declaredOwner: seller.inferredType === "owner" ? true : null,
        normalized: {
          title: fields.title,
          price: fields.price,
          currency: fields.currency,
          area: fields.area,
          rooms: fields.rooms,
          // Orașul și cartierul, exact cum sunt publicate.
          city: fields.cityText,
          neighbourhood: fields.neighbourhood,
          // Nomenclator: doar potrivire exactă, altfel gol (zona nu se inventează).
          county: zone.county,
          locality: zone.locality,
          localityId: zone.localityId,
          propertyType,
          publishedAt: fields.publishedAt,
          publishedText: fields.publishedText,
          sellerType: seller.inferredType,
          sellerSignals: seller.signals,
          // Doar adrese de imagini: nimic nu se descarcă.
          imageUrls: fields.imageUrls,
        },
        raw: {
          categoryText: fields.categoryText,
          params: fields.params,
          sellerBadgeText: fields.sellerBadgeText,
          locationDateText: `${fields.cityText ?? ""}${fields.neighbourhood ? `, ${fields.neighbourhood}` : ""}`,
        },
      });
    }
    return { items, failures };
  },
};
