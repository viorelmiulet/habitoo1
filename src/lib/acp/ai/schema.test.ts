import { describe, expect, it } from "vitest";
import { parseAcpAiInsight, stripCodeFences } from "./schema";

const valid = {
  executive_summary: "Piața este stabilă.",
  market_assessment: "Cererea este constantă în zonă.",
  comparable_analysis: "Comparabilele au aceeași suprafață.",
  price_recommendation_explanation: "Intervalul reflectă mediana comparabilelor.",
  risk_factors: ["Număr redus de comparabile"],
  data_quality_notes: ["Lipsesc anii de construcție"],
  key_observations: ["Prețul actual este peste mediană"],
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
    const { risk_factors: _omit, ...partial } = valid;
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
