import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/routes/_authenticated/app.anunturi-particulari.tsx", "utf8");

describe("Anunțuri particulari data-tour", () => {
  it("each static data-tour value appears once", () => {
    const vals = [...src.matchAll(/data-tour="([^"]+)"/g)].map((m) => m[1]);
    expect(vals.length).toBeGreaterThan(0);
    expect(new Set(vals).size).toBe(vals.length);
  });
  it("map-search and map-filters-toggle switch between phone and desktop, never both", () => {
    for (const id of ["map-search", "map-filters-toggle"]) {
      expect(src).not.toContain(`data-tour="${id}"`);
      expect(src.split(`isMobile ? "${id}" : undefined`).length - 1).toBe(1);
      expect(src.split(`isMobile ? undefined : "${id}"`).length - 1).toBe(1);
    }
  });
});
