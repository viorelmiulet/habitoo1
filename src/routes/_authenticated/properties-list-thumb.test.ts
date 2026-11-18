import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("./app.properties.index.tsx", import.meta.url), "utf8");

describe("lista Proprietăți: poze și favorite (CR16)", () => {
  it("butonul de favorite nu mai e ascuns pe calculator", () => {
    const fav = src.slice(src.indexOf("toggleFavorite.mutate(p.id)"), src.indexOf("<Star"));
    expect(fav).not.toContain("lg:hidden");
  });
  it("containerul pozei are lățimea 132px pe calculator", () => {
    expect(src).toContain("lg:h-24 lg:w-[132px]");
  });
});
