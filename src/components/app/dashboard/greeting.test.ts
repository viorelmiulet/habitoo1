import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

const at = (h: number) => new Date(2026, 10, 1, h, 0, 0);

describe("greetingFor", () => {
  it("09:00 → Bună dimineața", () => expect(greetingFor(at(9))).toBe("Bună dimineața"));
  it("14:00 → Bună ziua", () => expect(greetingFor(at(14))).toBe("Bună ziua"));
  it("20:00 → Bună seara", () => expect(greetingFor(at(20))).toBe("Bună seara"));
});
