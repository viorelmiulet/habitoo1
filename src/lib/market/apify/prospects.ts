/**
 * Apify → lista de prospecți.
 *
 * Modul pur: fără rețea și fără bază de date. O sursă poate alimenta bazinul de
 * piață, lista de prospecți sau ambele. Când alimentează ambele, în bazin intră
 * toate anunțurile, iar prospecți devin numai cele marcate explicit ca fiind
 * de la persoane fizice (proprietar). Nimic nu se ghicește: fără marcaj public
 * de vânzător, anunțul nu devine prospect.
 */
import { normalizeProspect } from "@/lib/prospecting/normalize";
import type { NormalizedProspect } from "@/lib/prospecting/types";
import { textValue, type MarketFieldMapping } from "../normalize";
import {
  APIFY_SELLER_KEYS,
  apifyMarketMapping,
  classifySellerType,
  readApifyExtra,
  readMappedField,
  type ApifyFieldMapping,
} from "./mapping";

export type ApifyProspectResult = {
  prospects: NormalizedProspect[];
  /** Anunțuri care nu devin prospecți (agenție, necunoscut sau date lipsă). */
  skipped: number;
  skipReasons: { reason: string; count: number }[];
};

function mappedText(
  record: Record<string, unknown>,
  mapping: MarketFieldMapping,
  field: Parameters<typeof readMappedField>[2],
): string | null {
  return textValue(readMappedField(record, mapping, field));
}

/** Transformă rezultatele Apify în prospecți normalizați (doar persoane fizice). */
export function buildApifyProspects(
  sourceKey: string,
  items: readonly unknown[],
  custom: ApifyFieldMapping | null,
  fetchedAt: string,
): ApifyProspectResult {
  const mapping = apifyMarketMapping(custom);
  const prospects: NormalizedProspect[] = [];
  const reasons = new Map<string, number>();
  const skip = (reason: string) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);

  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      skip("Rezultat fără structură de obiect.");
      continue;
    }
    const record = item as Record<string, unknown>;
    const seller = classifySellerType(
      readApifyExtra(record, custom, "sellerType", APIFY_SELLER_KEYS),
    );
    if (seller !== "owner") {
      skip(
        seller === "agency"
          ? "Anunț de agenție: nu devine prospect."
          : "Tip de vânzător nedeclarat: nu devine prospect.",
      );
      continue;
    }
    const url = mappedText(record, mapping, "url");
    const title = mappedText(record, mapping, "title") ?? mappedText(record, mapping, "address");
    if (!url) {
      skip("Lipsește adresa anunțului.");
      continue;
    }
    if (!title) {
      skip("Lipsește titlul anunțului.");
      continue;
    }

    const normalized = normalizeProspect({
      sourceKey,
      externalId: mappedText(record, mapping, "sourceListingId"),
      url,
      title,
      description: mappedText(record, mapping, "description"),
      fields: record,
      fetchedAt,
    });
    // Marcajul public al sursei are prioritate față de deducerea din text.
    prospects.push({ ...normalized, sellerType: "private", sellerConfidence: 1 });
  }

  return {
    prospects,
    skipped: [...reasons.values()].reduce((sum, count) => sum + count, 0),
    skipReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}
