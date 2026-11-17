import { describe, expect, it } from "vitest";
import { orderedPhotos, validatedPhotoOrder } from "./photo-order";
import { sanitizeAutofillResponse } from "./schema";

describe("AI18 photo order guards", () => {
  it("applies a complete permutation and retains unanalyzed photos", () => {
    expect(orderedPhotos(["a", "b", "c", "d"], ["a", "b", "c"], [2, 0, 1])).toEqual(["c", "a", "b", "d"]);
  });
  it("keeps the manual cover first, including an unanalyzed cover", () => {
    expect(orderedPhotos(["a", "b", "c"], ["a", "b", "c"], [2, 1, 0], "a")).toEqual(["a", "c", "b"]);
    expect(orderedPhotos(["d", "a", "b", "c"], ["a", "b", "c"], [2, 1, 0], "d")).toEqual(["d", "c", "b", "a"]);
  });
  it.each([null, [], [2, 0], [2, 0, 0], [3, 0, 1], [1.5, 0, 2], [2, 0, -1]])("invalid order %j never moves photos or gets repaired by the sanitizer", (order) => {
    expect(validatedPhotoOrder(order, 3)).toBeNull();
    expect(orderedPhotos(["a", "b", "c"], ["a", "b", "c"], order)).toBeNull();
    // Fractions fail the entire schema; other malformed orders are discarded.
    const result = sanitizeAutofillResponse({ fields: [], photo_order: order }, { spokenText: "", photoCount: 3 });
    expect(result?.photoOrder ?? null).toBeNull();
  });
  it("valid AI order survives the real sanitizer", () => {
    expect(sanitizeAutofillResponse({ fields: [], photo_order: [2, 0, 1] }, { spokenText: "", photoCount: 3 })?.photoOrder).toEqual([2, 0, 1]);
  });
});