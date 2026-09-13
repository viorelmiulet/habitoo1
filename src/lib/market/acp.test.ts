import { describe, expect, it } from "vitest";
import { dedupeMarketCandidates } from "./acp";

type Row = Parameters<typeof dedupeMarketCandidates>[0][number];

function row(partial: Partial<Row> & { id: string }): Row {
  return {
    market_entity_id: null,
    source: "imobiliare_ro",
    source_listing_id: partial.id,
    status: "active",
    last_seen_at: "2026-01-01T00:00:00.000Z",
    url: null,
    ...partial,
  } as Row;
}

describe("pregătirea ofertelor pentru ACP", () => {
  it("păstrează o singură ofertă per proprietate canonică", () => {
    const result = dedupeMarketCandidates([
      row({ id: "a", market_entity_id: "e1", source: "imobiliare_ro" }),
      row({ id: "b", market_entity_id: "e1", source: "storia" }),
      row({ id: "c", market_entity_id: "e2" }),
    ]);
    expect(result).toHaveLength(2);
    const first = result.find((item) => item.row.market_entity_id === "e1")!;
    expect(first.sources).toHaveLength(2);
    expect(first.duplicateCount).toBe(2);
  });

  it("preferă oferta activă în fața celei dispărute", () => {
    const result = dedupeMarketCandidates([
      row({ id: "old", market_entity_id: "e1", status: "inactive", last_seen_at: "2026-02-01T00:00:00.000Z" }),
      row({ id: "live", market_entity_id: "e1", status: "active", last_seen_at: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.row.source_listing_id).toBe("live");
    expect(result[0]?.active).toBe(true);
  });

  it("la statusuri egale alege cea mai recent văzută", () => {
    const result = dedupeMarketCandidates([
      row({ id: "vechi", market_entity_id: "e1", last_seen_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "nou", market_entity_id: "e1", last_seen_at: "2026-03-01T00:00:00.000Z" }),
    ]);
    expect(result[0]?.row.source_listing_id).toBe("nou");
  });

  it("ofertele fără entitate canonică rămân separate", () => {
    const result = dedupeMarketCandidates([
      row({ id: "x" }),
      row({ id: "y" }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.duplicateCount === 1)).toBe(true);
  });

  it("marchează inactiv grupul fără nicio ofertă activă", () => {
    const result = dedupeMarketCandidates([
      row({ id: "z", market_entity_id: "e9", status: "inactive" }),
    ]);
    expect(result[0]?.active).toBe(false);
  });
});
