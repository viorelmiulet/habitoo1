import { describe, expect, it } from "vitest";
import { houseraOfferFilter } from "./events";

describe("houseraOfferFilter", () => {
  it("întoarce exact JSON-ul pentru jsonb @>", () => {
    expect(houseraOfferFilter("id", "ZHW9UA9E")).toBe('[{"id":"ZHW9UA9E"}]');
    expect(houseraOfferFilter("reference", "abc-sale")).toBe('[{"reference":"abc-sale"}]');
  });
});
