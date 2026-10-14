import { describe, expect, it } from "vitest";
import { propertySheetFileName } from "./property-sheet";

describe("property sheet filename", () => {
  it("includes the offer code", () => {
    expect(propertySheetFileName("HB-1175")).toBe("fisa-proprietate-HB-1175.pdf");
  });
  it("has a fallback without a code", () => {
    expect(propertySheetFileName(null)).toBe("fisa-proprietate.pdf");
    expect(propertySheetFileName(" ")).toBe("fisa-proprietate.pdf");
  });
});