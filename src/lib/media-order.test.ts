import { describe, expect, it } from "vitest";
import { moveItem, withPrimaryFirst } from "./media-order";

const imgs = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("ordinea fotografiilor", () => {
  it("mută fotografia și păstrează ordinea celorlalte", () => {
    expect(moveItem(imgs, 2, 0).map((i) => i.id)).toEqual(["c", "a", "b", "d"]);
    expect(moveItem(imgs, 0, 3).map((i) => i.id)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(imgs, 1, 9).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("prima fotografie este principala, celelalte nu", () => {
    const out = withPrimaryFirst(moveItem(imgs, 3, 0));
    expect(out.map((i) => [i.id, i.position, i.is_primary])).toEqual([
      ["d", 0, true], ["a", 1, false], ["b", 2, false], ["c", 3, false],
    ]);
  });
});
