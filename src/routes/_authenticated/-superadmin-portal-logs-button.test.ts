import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("jurnalul portalurilor pe pagina Portaluri", () => {
  it("cardul „Jurnal operațiuni portaluri” nu mai apare", () => {
    const src = readFileSync("src/components/superadmin/PortalsCard.tsx", "utf8");
    expect(src).not.toContain("Jurnal operațiuni portaluri");
    expect(src).not.toContain("Vezi jurnalul");
  });
  it("butonul din antet trimite org și, cu portal selectat, portal", () => {
    const page = readFileSync("src/routes/_authenticated/superadmin.portals.tsx", "utf8");
    expect(page).toContain("Jurnal portaluri");
    expect(page).toContain("{ org: organizationId, ...(selectedPortal ? { portal: selectedPortal } : {}) }");
    expect(page).toContain("onSelectedChange={setSelectedPortal}");
    const card = readFileSync("src/components/superadmin/PortalsCard.tsx", "utf8");
    expect(card).toContain("onSelectedChange?.(selected)");
  });
});
