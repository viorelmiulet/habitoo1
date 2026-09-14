import { describe, expect, it } from "vitest";
import { parseAcpAiInsight, stripCodeFences } from "./schema";

const valid = {
  executive_summary: "Piața este stabilă.",
  valuation_explanation: "Intervalul reflectă mediana comparabilelor.",
  market_context: "Cererea este constantă în zonă.",
  comparable_analysis: "Comparabilele au aceeași suprafață.",
  key_drivers: ["Suprafața utilă"],
  risks_and_limitations: ["Număr redus de comparabile"],
  recommended_positioning: "Listare aproape de prețul recomandat.",
  confidence_explanation: "Încredere medie, din cauza numărului de comparabile.",
  client_friendly_summary: "Prețul cerut este apropiat de piață.",
};

describe("parseAcpAiInsight", () => {
  it("acceptă un JSON valid", () => {
    const result = parseAcpAiInsight(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.insight.executive_summary).toBe("Piața este stabilă.");
  });

  it("acceptă JSON în bloc de cod markdown", () => {
    const result = parseAcpAiInsight("```json\n" + JSON.stringify(valid) + "\n```");
    expect(result.ok).toBe(true);
  });

  it("respinge textul liber", () => {
    const result = parseAcpAiInsight("Piața pare stabilă, dar nu am JSON.");
    expect(result).toEqual({ ok: false, reason: "not_json" });
  });

  it("respinge JSON cu câmpuri lipsă", () => {
    const { risks_and_limitations: _omit, ...partial } = valid;
    const result = parseAcpAiInsight(JSON.stringify(partial));
    expect(result).toEqual({ ok: false, reason: "schema_mismatch" });
  });

  it("respinge răspunsul gol", () => {
    expect(parseAcpAiInsight("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAcpAiInsight(null)).toEqual({ ok: false, reason: "empty" });
  });

  it("ignoră câmpurile în plus, deci AI-ul nu poate strecura cifre proprii", () => {
    const result = parseAcpAiInsight(
      JSON.stringify({ ...valid, estimated_value: 999999, median_price_per_sqm: 1 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.insight).sort()).toEqual(Object.keys(valid).sort());
      expect(JSON.stringify(result.insight)).not.toContain("999999");
    }
  });

  it("curăță blocurile de cod", () => {
    expect(stripCodeFences("```\n{}\n```")).toBe("{}");
    expect(stripCodeFences("{}")).toBe("{}");
  });
});
