import { describe, expect, it } from "vitest";
import { buildReviewPayload, parseReviewResponse } from "./review";

const comps = [
  { key: "k1", title: "HB-1170 · Ap. 2 camere Militari Residence, sunați 0722123456", locationLabel: "Militari, București", subject: { rooms: 2, usableArea: 54 }, adjustedPricePerSqm: 1442 },
  { key: "k2", title: "2 camere Lacul Morii", locationLabel: "Militari, București", subject: { rooms: 2, usableArea: 63 }, adjustedPricePerSqm: 2349 },
];

describe("ACP AI review", () => {
  it("sends no phone numbers or internal references and maps complexes to their real area", () => {
    const { payload } = buildReviewPayload({ rooms: 2, usableArea: 55 }, comps, "HB-1171 · Ap. Militari Residence");
    const text = JSON.stringify(payload);
    expect(text).not.toContain("0722123456");
    expect(text).not.toContain("HB-1170");
    expect(payload.proprietate.zona_ansamblu).toBe("Chiajna, Ilfov");
  });

  it("is valid only when every comparable gets a verdict", () => {
    const { refs } = buildReviewPayload({}, comps);
    const partial = parseReviewResponse('{"comparabile":[{"ref":"c1","verdict":"ok","motiv":null}]}', refs);
    expect(partial.ok).toBe(false);
    const full = parseReviewResponse(
      '{"comparabile":[{"ref":"c1","verdict":"ok","motiv":null},{"ref":"c2","verdict":"suspect","motiv":"Lacul Morii e altă zonă"}]}',
      refs,
    );
    expect(full.ok).toBe(true);
    expect(full.items.k2).toEqual({ verdict: "suspect", reason: "Lacul Morii e altă zonă" });
    expect(full.items.k1).toEqual({ verdict: "ok", reason: null });
  });
});
