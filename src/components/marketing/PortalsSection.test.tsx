import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PORTALS, PROMOTION_CATALOGS } from "@/lib/portals/registry";
import { PortalsSection } from "./PortalsSection";

describe("grila publică de portaluri", () => {
  it("afișează fiecare portal și Catalog Facebook o singură dată, după portaluri, cu logo-ul lui", () => {
    const html = renderToStaticMarkup(<PortalsSection />);
    const names = [...html.matchAll(/<p class="truncate text-sm font-semibold text-navy">([^<]+)<\/p>/g)].map((match) => match[1]);
    expect(names).toEqual([...PORTALS.map((portal) => portal.display_name), ...PROMOTION_CATALOGS.map((catalog) => catalog.display_name)]);
    expect(names.filter((name) => name === "Catalog Facebook")).toHaveLength(1);
    expect(html).toMatch(/facebook\.svg/);
  });
});