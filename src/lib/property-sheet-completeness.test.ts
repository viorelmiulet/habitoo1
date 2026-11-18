import { describe, expect, it } from "vitest";
import { sheetCompleteness, sheetTone } from "./property-sheet-completeness";

const full = { floor: 2, surface: 70, rooms: 3, features: ["lift"], propertyType: "apartment" };

describe("CR3 — completarea fișei", () => {
  it("100% când toate câmpurile esențiale există; etajul 0 (parter) contează", () => {
    expect(sheetCompleteness(full)).toBe(100);
    expect(sheetCompleteness({ ...full, floor: 0 })).toBe(100);
  });
  it("0% fără niciun câmp esențial; dotări goale contează ca lipsă", () => {
    expect(sheetCompleteness({ floor: null, surface: null, rooms: null, features: [], propertyType: "apartment" })).toBe(0);
    expect(sheetCompleteness({ ...full, features: [] })).toBe(75);
  });
  it("la case etajul nu se cere", () => {
    expect(sheetCompleteness({ ...full, floor: null, propertyType: "house" })).toBe(100);
    expect(sheetCompleteness({ ...full, floor: null, rooms: null, propertyType: "house" })).toBe(67);
  });
  it("praguri de culoare: ≥90 verde, ≥70 cyan, sub 70 auriu", () => {
    expect(sheetTone(90)).toBe("success");
    expect(sheetTone(89)).toBe("ai");
    expect(sheetTone(70)).toBe("ai");
    expect(sheetTone(69)).toBe("gold");
  });
});
