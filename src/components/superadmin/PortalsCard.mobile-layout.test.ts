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
    expect(agency.match(/data-portal-statuses className="[^"]*flex flex-wrap[^"]*"/g)).toHaveLength(1);
  });

  it("nu pune logo-urile într-o casetă cu lățime fixă la portalurile duble (storia, romimo)", () => {
    for (const [name, source] of [
      ["superadmin", superadmin],
      ["agency", agency],
    ] as const) {
      const boxed = source.match(/size-10[^>]*>\s*<PortalLogoStack/);
      expect(boxed, `${name} învelește PortalLogoStack într-o casetă size-10`).toBeNull();
      expect(
        source,
        `${name} trebuie să păstreze PortalLogoStack shrink-0 lângă nume`,
      ).toMatch(/<PortalLogoStack[\s\S]{0,220}className="shrink-0"/);
    }
  });
});