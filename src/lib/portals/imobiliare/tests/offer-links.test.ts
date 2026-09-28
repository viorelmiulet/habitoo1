import { describe, expect, it } from "vitest";
import {
  buildImobiliareOffer,
  extractImobiliareOfferId,
  imobiliareOfferUrl,
  mergePortalOffers,
} from "../offer-links";

describe("Imobiliare.ro: ID real și link public", () => {
  it("răspuns cu id → link corect", () => {
    const offer = buildImobiliareOffer("HB-1003", "sale", { data: { id: 275994142 } });
    expect(offer).toEqual({
      transaction: "sale",
      reference: "HB-1003",
      id: "275994142",
      url: "https://www.imobiliare.ro/oferta/275994142",
    });
    expect(extractImobiliareOfferId({ body: { data: { id: 7 } } })).toBe("7");
  });

  it("răspuns fără id → fără link", () => {
    expect(buildImobiliareOffer("HB-1", "sale", { data: {} }, null, { ok: true })).toBeNull();
    expect(extractImobiliareOfferId({ data: { id: "abc" } })).toBeNull();
  });

  it("vânzare + închiriere → două linkuri", () => {
    const offers = [
      buildImobiliareOffer("HB-1010-V", "sale", { data: { id: 1 } })!,
      buildImobiliareOffer("HB-1010-I", "rent", { data: { id: 2 } })!,
    ];
    const merged = mergePortalOffers([], offers);
    expect(merged.map((o) => o.url)).toEqual([imobiliareOfferUrl("1"), imobiliareOfferUrl("2")]);
  });

  it("actualizarea păstrează referința HB-xxxx și ID-ul vechi fără id nou", () => {
    const prev = [buildImobiliareOffer("HB-1006", "sale", { data: { id: 5 } })!];
    const updated = mergePortalOffers(prev, [buildImobiliareOffer("HB-1006", "sale", { data: { id: 6 } })!]);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.reference).toBe("HB-1006");
    expect(updated[0]!.id).toBe("6");
    expect(mergePortalOffers(prev, [])).toEqual(prev);
  });
});
