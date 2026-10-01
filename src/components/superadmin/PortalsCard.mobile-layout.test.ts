import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("cardurile portalurilor pe mobil", () => {
  const superadmin = readFileSync("src/components/superadmin/PortalsCard.tsx", "utf8");
  const agency = readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8");

  it("nu trunchiază numele portalurilor", () => {
    expect(superadmin).toContain('text-[17px] leading-6 font-bold break-words');
    expect(agency).toContain('text-[17px] leading-6 font-bold break-words');
    expect(superadmin).not.toContain('block truncate font-medium">{portalDisplayName(item.portal.id)}');
    expect(agency).not.toContain('truncate text-sm font-semibold">{item.displayName}');
  });

  it("ține etichetele într-un container care permite trecerea pe rând nou", () => {
    expect(superadmin).toMatch(/data-portal-statuses className="[^"]*flex flex-wrap[^"]*"/);
    expect(agency.match(/data-portal-statuses className="[^"]*flex flex-wrap[^"]*"/g)).toHaveLength(2);
  });
});