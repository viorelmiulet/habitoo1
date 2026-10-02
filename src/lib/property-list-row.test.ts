import { describe, expect, it } from "vitest";
import {
  canShowDeleteAction,
  formatPropertyListDetails,
  formatPropertyListPrice,
  portalDotTone,
  portalStateLabel,
} from "./property-list-row";

describe("property list row", () => {
  it("formats floor labels and singular rooms in the detail line", () => {
    expect(formatPropertyListDetails({ reference: "HB-1", rooms: 1, floor: -1 })).toBe("HB-1 · 1 cameră · demisol");
    expect(formatPropertyListDetails({ reference: "HB-2", floor: 0 })).toBe("HB-2 · parter");
  });

  it("formats rent prices, EUR and price per square metre", () => {
    expect(formatPropertyListPrice(114000, "EUR", "sale", 45)).toEqual({ main: "114.000 €", suffix: null, perSquareMeter: "2.533 €/m²" });
    expect(formatPropertyListPrice(450, "EUR", "rent", 50)).toEqual({ main: "450 €", suffix: "/lună", perSquareMeter: "9 €/m²" });
  });

  it("maps portal states to the requested dot tones", () => {
    expect(portalDotTone("published")).toBe("success");
    expect(portalDotTone("in_feed")).toBe("success");
    expect(portalDotTone("selected")).toBe("warning");
    expect(portalDotTone("syncing")).toBe("warning");
    expect(portalDotTone("expired")).toBe("warning");
    expect(portalDotTone("error")).toBe("danger");
    expect(portalDotTone("withdrawn")).toBe("neutral");
  });

  it("uses the same visible publication labels for equivalent portal states", () => {
    expect(portalStateLabel("published")).toBe("Publicat");
    expect(portalStateLabel("in_feed")).toBe("Publicat");
    expect(portalStateLabel("not_selected")).toBe("Nepublicat");
    expect(portalStateLabel("withdrawn")).toBe("Nepublicat");
  });

  it("shows Delete only when permission allows it", () => {
    expect(canShowDeleteAction(true)).toBe(true);
    expect(canShowDeleteAction(false)).toBe(false);
  });
});
