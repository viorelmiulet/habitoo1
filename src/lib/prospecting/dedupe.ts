/**
 * Deduplicare deterministă (Stage 13).
 *
 * Nivelurile se aplică în ordine, iar potrivirea fuzzy este ultima opțiune:
 *   1. sursă + external_id
 *   2. URL canonic
 *   3. telefon normalizat
 *   4. content hash
 *   5. combinație normalizată (telefon/vânzător + localizare + camere + suprafață + preț)
 *   6. similaritate fuzzy pe titlu, cu aceeași localitate și preț apropiat
 *
 * Nimic nu se șterge: duplicatele sunt marcate și grupate prin `groupKey`, iar
 * runtime-ul mapează grupul într-un `duplicate_group_id`.
 */
import { foldText } from "./normalize";
import type { NormalizedProspect } from "./types";

export type DedupeLevel =
  | "external_id"
  | "canonical_url"
  | "phone"
  | "content_hash"
  | "composite"
  | "fuzzy";

export type DedupeItem = {
  /** Cheie locală stabilă (index sau id existent în baza de date). */
  key: string;
  prospect: Pick<
    NormalizedProspect,
    | "sourceKey"
    | "externalId"
    | "canonicalUrl"
    | "sellerPhone"
    | "contentHash"
    | "city"
    | "rooms"
    | "surfaceUseful"
    | "price"
    | "title"
    | "sellerName"
  >;
};

export type DedupeDecision = {
  key: string;
  /** Cheia „primului văzut” din grup; egală cu `key` pentru originale. */
  groupKey: string;
  duplicate: boolean;
  level: DedupeLevel | null;
};

export type DedupeResult = {
  decisions: DedupeDecision[];
  /** Grupuri cu cel puțin doi membri: candidat original + duplicate. */
  groups: { groupKey: string; keys: string[] }[];
  duplicates: number;
};

function compositeKey(item: DedupeItem): string | null {
  const p = item.prospect;
  const identity = p.sellerPhone ?? (p.sellerName ? foldText(p.sellerName) : null);
  if (!identity || !p.city || p.rooms === null || p.surfaceUseful === null || p.price === null) {
    return null;
  }
  return [identity, foldText(p.city), p.rooms, Math.round(p.surfaceUseful), Math.round(p.price)].join(
    "|",
  );
}

function tokens(value: string): Set<string> {
  return new Set(
    foldText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );
}

/** Similaritate Jaccard pe tokenii titlului: 0..1, deterministă. */
export function titleSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = new Set([...left, ...right]).size;
  return Math.round((shared / union) * 100) / 100;
}

const FUZZY_THRESHOLD = 0.72;

function fuzzyMatch(a: DedupeItem, b: DedupeItem): boolean {
  const left = a.prospect;
  const right = b.prospect;
  if (!left.city || !right.city || foldText(left.city) !== foldText(right.city)) return false;
  if (left.price !== null && right.price !== null) {
    const spread = Math.abs(left.price - right.price) / Math.max(left.price, right.price);
    if (spread > 0.02) return false;
  }
  if (left.rooms !== null && right.rooms !== null && left.rooms !== right.rooms) return false;
  return titleSimilarity(left.title, right.title) >= FUZZY_THRESHOLD;
}

/**
 * Deduplică lista nouă față de ea însăși și față de prospectele deja salvate.
 * `existing` participă doar ca „original”: nu primește niciodată decizia de duplicat.
 */
export function dedupeProspects(items: DedupeItem[], existing: DedupeItem[] = []): DedupeResult {
  const decisions: DedupeDecision[] = [];
  const groupOf = new Map<string, string>();
  const byExternal = new Map<string, string>();
  const byUrl = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byContent = new Map<string, string>();
  const byComposite = new Map<string, string>();
  const seen: DedupeItem[] = [];

  const register = (item: DedupeItem, groupKey: string) => {
    groupOf.set(item.key, groupKey);
    const p = item.prospect;
    if (p.externalId) {
      const key = `${p.sourceKey}:${p.externalId}`;
      if (!byExternal.has(key)) byExternal.set(key, groupKey);
    }
    if (p.canonicalUrl && !byUrl.has(p.canonicalUrl)) byUrl.set(p.canonicalUrl, groupKey);
    if (p.sellerPhone && !byPhone.has(p.sellerPhone)) byPhone.set(p.sellerPhone, groupKey);
    if (!byContent.has(p.contentHash)) byContent.set(p.contentHash, groupKey);
    const composite = compositeKey(item);
    if (composite && !byComposite.has(composite)) byComposite.set(composite, groupKey);
    seen.push(item);
  };

  for (const item of existing) register(item, item.key);

  for (const item of items) {
    const p = item.prospect;
    let level: DedupeLevel | null = null;
    let groupKey: string | undefined;

    if (p.externalId) {
      groupKey = byExternal.get(`${p.sourceKey}:${p.externalId}`);
      if (groupKey) level = "external_id";
    }
    if (!groupKey && p.canonicalUrl) {
      groupKey = byUrl.get(p.canonicalUrl);
      if (groupKey) level = "canonical_url";
    }
    if (!groupKey && p.sellerPhone) {
      groupKey = byPhone.get(p.sellerPhone);
      if (groupKey) level = "phone";
    }
    if (!groupKey) {
      groupKey = byContent.get(p.contentHash);
      if (groupKey) level = "content_hash";
    }
    if (!groupKey) {
      const composite = compositeKey(item);
      if (composite) {
        groupKey = byComposite.get(composite);
        if (groupKey) level = "composite";
      }
    }
    if (!groupKey) {
      const match = seen.find((candidate) => fuzzyMatch(candidate, item));
      if (match) {
        groupKey = groupOf.get(match.key) ?? match.key;
        level = "fuzzy";
      }
    }

    if (groupKey) {
      decisions.push({ key: item.key, groupKey, duplicate: true, level });
      register(item, groupKey);
    } else {
      decisions.push({ key: item.key, groupKey: item.key, duplicate: false, level: null });
      register(item, item.key);
    }
  }

  const grouped = new Map<string, string[]>();
  for (const [key, groupKey] of groupOf.entries()) {
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), key]);
  }

  return {
    decisions,
    groups: [...grouped.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([groupKey, keys]) => ({ groupKey, keys: [...keys].sort() })),
    duplicates: decisions.filter((decision) => decision.duplicate).length,
  };
}
