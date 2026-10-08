import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortalLogo, hasPortalLogo } from "@/components/app/PortalLogo";
import { portalLogoIds } from "@/lib/portals/registry";

describe("logo-ul portalului OLX.ro (cont propriu)", () => {
  it("are logo local, deci cardul nu afișează inițialele", () => {
    expect(hasPortalLogo("olx_direct")).toBe(true);
    const html = renderToStaticMarkup(
      <PortalLogo portalId="olx_direct" name="OLX.ro (cont propriu)" size={40} alt="OLX.ro (cont propriu)" />,
    );
    expect(html).toContain("<img");
    expect(html).not.toContain(">OX<");
  });

  it("nu afișează și logo-ul Storia alături de OLX direct", () => {
    expect(portalLogoIds("olx_direct")).toEqual(["olx_direct"]);
  });
});
