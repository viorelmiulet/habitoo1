import { describe, expect, it } from "vitest";
import { agencyDot, buildAgencyRowsFrom, expiryCell, lastLoginCell, subscriptionCell } from "./superadmin-agencies";

const NOW = Date.parse("2026-11-01T21:30:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("Cardul Agenții", () => {
  it("punct roșu > 14 zile sau lipsă, auriu la 0 proprietăți, altfel verde", () => {
    expect(agencyDot(null, 5, NOW)).toBe("red");
    expect(agencyDot(iso(NOW - 15 * DAY), 5, NOW)).toBe("red");
    expect(agencyDot(iso(NOW - DAY), 0, NOW)).toBe("gold");
    expect(agencyDot(iso(NOW - DAY), 3, NOW)).toBe("green");
  });

  it("abonament din termLabel", () => {
    expect(subscriptionCell("basic", "trial_30d", true)).toBe("Trial · 30 zile");
    expect(subscriptionCell("basic", "trial_90d", false)).toBe("Trial · 90 zile");
    expect(subscriptionCell("basic", "30d", false)).toBe("Basic · 30 zile");
    expect(subscriptionCell("basic", null, false)).toBe("Basic · fără termen");
  });

  it("expiră: dată scurtă, pastilă ≤7 zile, expirat, —", () => {
    expect(expiryCell("2026-11-22T23:59:59Z", NOW)).toEqual({ text: "23 nov", tone: "plain" });
    expect(expiryCell("2027-01-17T05:46:00Z", NOW).text).toBe("17 ian 2027");
    expect(expiryCell("2026-11-08T14:18:00Z", NOW)).toEqual({ text: "8 nov · în 7 zile", tone: "warning" });
    expect(expiryCell(iso(NOW - DAY), NOW).tone).toBe("error");
    expect(expiryCell(null, NOW).text).toBe("—");
  });

  it("ultima logare în Europe/Bucharest", () => {
    expect(lastLoginCell("2026-11-01T20:24:00Z", NOW).main).toBe("azi, 22:24");
    expect(lastLoginCell("2026-10-31T07:10:00Z", NOW).main).toBe("ieri, 09:10");
    expect(lastLoginCell("2026-10-13T07:59:00Z", NOW)).toEqual({ main: "13 oct", ago: "acum 19 zile" });
    expect(lastLoginCell(null, NOW).main).toBe("niciodată");
  });

  it("sortare: roșu, auriu, apoi proprietăți descrescător", () => {
    const base = { plan: "basic", isTrial: false, term: null, expiresAt: null, users: 1, portals: 0, connectionErrors: 0 };
    const rows = buildAgencyRowsFrom(
      [
        { ...base, id: "g1", name: "G1", activeProperties: 5, lastLoginAt: iso(NOW - DAY) },
        { ...base, id: "g2", name: "G2", activeProperties: 50, lastLoginAt: iso(NOW - DAY) },
        { ...base, id: "y", name: "Y", activeProperties: 0, lastLoginAt: iso(NOW - DAY) },
        { ...base, id: "r", name: "R", activeProperties: 9, lastLoginAt: null },
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["r", "y", "g2", "g1"]);
  });
});
