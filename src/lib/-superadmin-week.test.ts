import { describe, expect, it } from "vitest";
import { isActiveLogin, portalOpsHint, weekDelta, WEEK_PORTAL_OPERATIONS } from "./superadmin-week";

describe("Ultimele 7 zile", () => {
  it("diferența: creștere verde, scădere roșie, egalitate neutră", () => {
    expect(weekDelta(5, 3)).toEqual({ label: "+2 față de săpt. trecută", tone: "up" });
    expect(weekDelta(2, 3)).toEqual({ label: "−1 față de săpt. trecută", tone: "down" });
    expect(weekDelta(4, 4).tone).toBe("flat");
  });

  it("operațiuni: procent de reușită și eșuate", () => {
    expect(portalOpsHint(2891, 59)).toBe("98% reușite · 59 eșuate");
    expect(portalOpsHint(0, 0)).toBe("nicio operațiune");
    expect(WEEK_PORTAL_OPERATIONS).toEqual(["publish", "update", "republish", "withdraw"]);
  });

  it("utilizator activ = autentificat în ultimele 7 zile", () => {
    const since = Date.parse("2026-10-25T21:00:00Z");
    expect(isActiveLogin("2026-10-26T00:00:00Z", since)).toBe(true);
    expect(isActiveLogin("2026-10-20T00:00:00Z", since)).toBe(false);
    expect(isActiveLogin(null, since)).toBe(false);
  });
});
