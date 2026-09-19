/**
 * Adaptorul OLX — DOAR pagini publice, citite din JSON-ul încorporat.
 *
 * Fără autentificare, fără cookie-uri păstrate, fără proxy, fără mascarea
 * identității și fără selectori de HTML: sursa de adevăr este
 * `window.__PRERENDERED_STATE__`. Nu citește, nu salvează și nu hash-uiește
 * NICIUN număr de telefon — nu există nicio referire la telefon aici.
 *
 * Proprietar vs agenție vine exclusiv din `isBusiness` al anunțului. Tipul de
 * proprietate vine din categoria de căutare. Coordonatele au raza declarată de
 * OLX și nu sunt prezentate niciodată ca poziție exactă.
 */
import type { CollectorAdapter, CollectorParsedItem, CollectorParseFailure } from "../adapters";
import { readOlxAd } from "./ads";
import { mapOlxCategoryId } from "./mapping";
import { adsFromState, extractPrerenderedState } from "./prerendered";
import {
  olxNarrowingReason,
  olxNeedsNarrowing,
  olxPageUrl,
  olxTargetForUrl,
  parseOlxConfig,
} from "./targets";

export const OLX_SOURCE_KEY = "olx";

export const olxAdapter: CollectorAdapter = {
  key: OLX_SOURCE_KEY,

  pageUrl: ({ baseUrl, config, page }) => olxPageUrl(baseUrl, parseOlxConfig(config), page),

  parsePage: ({ url, body, config }) => {
    const parsedConfig = parseOlxConfig(config);
    const items: CollectorParsedItem[] = [];
    const failures: CollectorParseFailure[] = [];

    const state = extractPrerenderedState(body);
    if (!state.ok) return { items, failures: [{ url, reason: state.reason }] };

    const ads = adsFromState(state.state);
    if (!ads.ok) return { items, failures: [{ url, reason: ads.reason }] };

    const target = olxTargetForUrl(parsedConfig, url);
    if (target && olxNeedsNarrowing(ads.totalCount)) {
      // Peste plafonul OLX: raportăm ca „de îngustat”, nu pierdem anunțuri tacit.
      failures.push({ url, reason: olxNarrowingReason(target, ads.totalCount as number) });
    }

    for (const ad of ads.ads) {
      const outcome = readOlxAd(ad, { categoryTypes: parsedConfig.categoryTypes });
      if (!outcome.ok) {
        failures.push({ url, reason: outcome.reason });
        continue;
      }
      const fields = outcome.fields;
      // Categoria de căutare este sursa tipului: harta de categorii mai întâi,
      // altfel tipul declarat al țintei, altfel „necunoscut”.
      const mapped = mapOlxCategoryId(fields.categoryId, parsedConfig.categoryTypes);
      const propertyType = mapped !== "necunoscut" ? mapped : (target?.type ?? "necunoscut");

      items.push({
        url: fields.url,
        sourceItemId: fields.sourceItemId,
        inferredType: fields.sellerType,
        imageUrls: fields.photos,
        // Semnalul păstrat este exact steagul declarat de OLX.
        signals: { source: "olx", isBusiness: fields.isBusiness },
        declaredAgency: fields.isBusiness === true ? true : null,
        declaredOwner: fields.isBusiness === false ? true : null,
        normalized: {
          title: fields.title,
          description: fields.description,
          price: fields.price,
          currency: fields.currency,
          area: fields.params.area,
          city: fields.location.cityName,
          county: fields.location.regionName,
          neighbourhood: fields.location.districtName,
          propertyType,
          categoryId: fields.categoryId,
          publishedAt: fields.createdTime,
          refreshedAt: fields.lastRefreshTime,
          status: fields.status,
          isPromoted: fields.isPromoted,
          sellerType: fields.sellerType,
          floor: fields.params.floor,
          construction: fields.params.construction,
          layout: fields.params.layout,
          // Poziția are rază declarată de OLX: aproximativă, niciodată exactă.
          lat: fields.point.lat,
          lng: fields.point.lon,
          locationRadiusMeters: fields.point.radiusMeters,
          locationPrecise: false,
          // Doar adrese de imagini: nimic nu se descarcă.
          imageUrls: fields.photos,
        },
        raw: {
          categoryId: fields.categoryId,
          isBusiness: fields.isBusiness,
          location: fields.location,
          map: fields.point,
          params: fields.params,
          searchTargetType: target?.type ?? null,
        },
      });
    }
    return { items, failures };
  },
};
