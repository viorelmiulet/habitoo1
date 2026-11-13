import { describe, expect, it } from "vitest";
import { sortPromotionPortals } from "./promotion-portal-order";

const ids = (xs: string[]) => sortPromotionPortals(xs.map((p) => ({ p })), (x) => x.p).map((x) => x.p);

describe("sortPromotionPortals", () => {
  it("Imobiliare.ro rămâne ultimul după un portal de feed dinamic", () => {
    expect(ids(["storia", "imobiliare_ro", "vdi", "mvaimobiliare"])).toEqual(["storia", "vdi", "mvaimobiliare", "imobiliare_ro"]);
  });
  it("fără Imobiliare.ro ordinea rămâne neschimbată", () => {
    expect(ids(["vdi", "storia", "mvaimobiliare"])).toEqual(["vdi", "storia", "mvaimobiliare"]);
  });
});
