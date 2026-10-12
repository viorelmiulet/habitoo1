import { describe, expect, it } from "vitest";
import { applyOlxExport, isStoriaVasFlow, readVasEvent, visibleOlxLinks } from "./vas";

const NOW = Date.parse("2026-10-12T19:00:00Z");
const payload = (data: Record<string, unknown>) => ({
  flow: "vas_lifecycle",
  event_type: "advert_vas_applied_success",
  object_id: "baaf169f-de55-4ee7-9925-fb7a2c29749b",
  data: {
    advert_uuid: "439a8608-1b6c-4b56-a42b-f9473e4430e9",
    promotion_code: "olx",
    status: "applied",
    custom_fields: { olx_id: "310505212", olx_url: "https://www.olx.ro/310505212" },
    expires_at: "2026-11-10T21:29:41.000+02:00",
    ...data,
  },
});

describe("Storia VAS / export OLX", () => {
  it("notificarea olx aplicată salvează linkul", () => {
    const p = payload({});
    expect(isStoriaVasFlow(p)).toBe(true);
    const e = readVasEvent(p);
    expect(e.advertUuid).toBe("439a8608-1b6c-4b56-a42b-f9473e4430e9");
    const offers = applyOlxExport([], "sale", e, NOW);
    expect(visibleOlxLinks(offers, "published", NOW)).toEqual([
      { transaction: "sale", url: "https://www.olx.ro/310505212" },
    ]);
  });

  it("o promovare expirată ascunde linkul", () => {
    const saved = applyOlxExport([], "sale", readVasEvent(payload({})), NOW);
    const after = applyOlxExport(saved, "sale", readVasEvent(payload({ status: "expired" })), NOW);
    expect(visibleOlxLinks(after, "published", NOW)).toEqual([]);
    expect(visibleOlxLinks(saved, "published", Date.parse("2026-12-01T00:00:00Z"))).toEqual([]);
  });

  it("o promovare non-OLX nu are efect", () => {
    const e = readVasEvent(payload({ promotion_code: "pushup" }));
    expect(e.promotionCode).toBe("pushup");
    const prev = [{ transaction: "sale", reference: "HB-1", id: "1", url: "https://x.ro/1" }];
    expect(applyOlxExport(prev, "sale", e, NOW)).toEqual(prev);
  });

  it("anunțul retras sau expirat nu mai afișează linkul OLX", () => {
    const offers = applyOlxExport([], "sale", readVasEvent(payload({})), NOW);
    expect(visibleOlxLinks(offers, "withdrawn", NOW)).toEqual([]);
    expect(visibleOlxLinks(offers, "expired", NOW)).toEqual([]);
  });
});
