import { describe, expect, it } from "vitest";
import { formatFloorLabel } from "./property-floor";
import { buildVideoOverlay } from "./property-video";
import { buildSocialPostText } from "./social-post";

describe("formatFloorLabel", () => {
  it("numere", () => {
    expect(formatFloorLabel(null, -1)).toBe("Demisol");
    expect(formatFloorLabel(null, 0)).toBe("Parter");
    expect(formatFloorLabel(null, 1)).toBe("Etaj 1");
    expect(formatFloorLabel(null, 100)).toBe("Mansardă");
    expect(formatFloorLabel(null, null)).toBeNull();
  });
  it("etichete deja formatate", () => {
    expect(formatFloorLabel("Etaj 1")).toBe("Etaj 1");
    expect(formatFloorLabel("Parter")).toBe("Parter");
    expect(formatFloorLabel("Mansardă")).toBe("Mansardă");
    expect(formatFloorLabel("Etaj 100")).toBe("Mansardă");
    expect(formatFloorLabel("Etaj Parter")).toBe("Parter");
    expect(formatFloorLabel("1")).toBe("Etaj 1");
  });
});

describe("fără „Etaj Etaj”", () => {
  const listing = { title: "T", district: null, city: null, price: null, rooms: 2, usableSurface: 50, reference: null, agentName: null, agentPhone: null, logoUrl: null };
  const o = { showLogo: true, showPhone: true, showPrice: true };
  it("video", () => {
    for (const f of ["Etaj 1", "Parter", "Demisol", "Mansardă", "3"]) {
      const facts = buildVideoOverlay({ ...listing, floor: f }, o).intro.facts.join(" ");
      expect(facts).not.toMatch(/Etaj (Etaj|Parter|Demisol|Mansard)/);
    }
    expect(buildVideoOverlay({ ...listing, floor: "Etaj 1" }, o).intro.facts).toContain("Etaj 1");
  });
  it("text social", () => {
    const t = buildSocialPostText("facebook", { propertyType: "apartment", transactionKind: "sale", rooms: 2, district: null, city: "București", floor: 100, floorLabel: "Mansardă", usableSurface: null, features: [], price: null, currency: null, agentName: null, agentPhone: null });
    expect(t).toContain("Mansardă");
    expect(t).not.toMatch(/Etaj (Etaj|Mansard|100)/);
  });
});

it("posterul folosește eticheta comună", async () => {
  const { readFileSync } = await import("node:fs");
  const c = readFileSync("src/components/app/SocialPosterDialog.tsx", "utf8");
  expect(c).toContain("formatFloorLabel(props.floor)");
  expect(c).not.toContain("`Etaj ${");
});
