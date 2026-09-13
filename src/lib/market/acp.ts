/**
 * Pregătirea ofertelor de piață pentru motorul ACP.
 *
 * O proprietate publicată pe mai multe portaluri trebuie numărată o singură
 * dată: grupăm după entitatea canonică (`market_entity_id`) și păstrăm toate
 * sursele pentru explicabilitate. Ofertele active au prioritate față de cele
 * dispărute/arhivate, iar algoritmul de ajustări din faza 2 rămâne neatins.
 */

export type MarketCandidateRow = {
  id: string;
  source: string;
  source_listing_id: string | null;
  url: string | null;
  market_entity_id: string | null;
  status: string;
  last_seen_at: string;
  dedupe_status?: string | null;
};

export type DedupedMarketCandidate<T extends MarketCandidateRow> = {
  row: T;
  /** Toate sursele care descriu aceeași proprietate. */
  sources: { source: string; sourceListingId: string | null; url: string | null }[];
  /** Numărul de anunțuri unificate în acest comparabil. */
  duplicateCount: number;
  active: boolean;
};

const STATUS_RANK: Record<string, number> = { active: 3, inactive: 2, archived: 1 };

/**
 * Elimină dublurile cross-source: o intrare per entitate canonică, cu oferta
 * cea mai relevantă (activă, apoi cea mai recent văzută) drept reprezentant.
 */
export function dedupeMarketCandidates<T extends MarketCandidateRow>(
  rows: readonly T[],
): DedupedMarketCandidate<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.market_entity_id ?? `listing:${row.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const out: DedupedMarketCandidate<T>[] = [];
  for (const bucket of groups.values()) {
    const sorted = [...bucket].sort((a, b) => {
      const rank = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0);
      if (rank !== 0) return rank;
      return Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at);
    });
    const best = sorted[0]!;
    const sources: DedupedMarketCandidate<T>["sources"] = [];
    const seen = new Set<string>();
    for (const row of sorted) {
      const key = `${row.source}|${row.source_listing_id ?? row.url ?? row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ source: row.source, sourceListingId: row.source_listing_id, url: row.url });
    }
    out.push({
      row: best,
      sources,
      duplicateCount: sorted.length,
      active: best.status === "active",
    });
  }
  return out;
}
