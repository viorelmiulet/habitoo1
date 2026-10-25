import { describe, expect, it } from "vitest";
import indexSource from "./app.acp.date-piata.index.tsx?raw";
import detailSource from "./app.acp.date-piata.$id.tsx?raw";
import { agencyNav, withMarketDataNav } from "@/components/app/AppSidebar";
import { superadminGateDecision } from "@/lib/superadmin-status";

const MARKET_PATH = "/app/acp/date-piata";

const hasItem = (groups: typeof agencyNav, path: string) =>
  groups.some((group) => group.items.some((item) => String(item.to) === path));

describe("Date piață — acces doar pentru SuperAdmin", () => {
  it("nu apare în meniul unui utilizator obișnuit", () => {
    expect(hasItem(agencyNav, MARKET_PATH)).toBe(false);
    expect(hasItem(withMarketDataNav(agencyNav, false), MARKET_PATH)).toBe(false);
  });

  it("apare în meniul SuperAdmin, în grupul ACP", () => {
    const acp = withMarketDataNav(agencyNav, true).find((group) => group.title === "ACP");
    expect(acp?.items.map((item) => String(item.to))).toContain(MARKET_PATH);
  });

  it("trimite oricine altcineva înapoi la ACP", () => {
    expect(superadminGateDecision({ isSuperadmin: false }, false)).toBe("denied");
    expect(superadminGateDecision({ isSuperadmin: true }, false)).toBe("granted");
    expect(superadminGateDecision(null, false)).toBe("signed_out");
    expect(superadminGateDecision(null, true)).toBe("loading");
  });

  it("ambele pagini de date piață sunt închise în SuperadminGate", () => {
    expect(indexSource).toContain("<SuperadminGate>");
    expect(detailSource).toContain("<SuperadminGate>");
  });
});
