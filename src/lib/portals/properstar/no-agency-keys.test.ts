import { describe, expect, it } from "vitest";
import { assertPortalKeyAllowed } from "@/lib/portals/key-policy";
import { getPortalDefinition } from "@/lib/portals/registry";
import { properstarFeedStatus } from "./feed-status";
import { properstarLegacyFeedResponse } from "@/routes/api/public/feed/properstar/$agencyKey";

describe("Properstar fără chei pe agenție", () => {
  it("refuză generarea cheii pentru Properstar", () => {
    const def = getPortalDefinition("properstar")!;
    expect(() => assertPortalKeyAllowed(def)).toThrow(/Properstar nu folosește chei/);
    // Chiar dacă registrul ar declara cheie Habitoo, refuzul rămâne.
    expect(() =>
      assertPortalKeyAllowed({ ...def, authentication: ["habitoo_api_key"] }),
    ).toThrow(/Properstar/);
    expect(def.public_feed_path_template).toBeUndefined();
  });

  it("refuză iMove și acceptă un portal cu cheie Habitoo", () => {
    expect(() => assertPortalKeyAllowed(getPortalDefinition("imove")!)).toThrow();
    expect(() =>
      assertPortalKeyAllowed({ id: "x", display_name: "X", authentication: ["habitoo_api_key"] }),
    ).not.toThrow();
  });

  it("ruta veche răspunde 404", async () => {
    const res = properstarLegacyFeedResponse();
    expect(res.status).toBe(404);
  });

  it("cele trei stări ale cardului", () => {
    expect(properstarFeedStatus({ activated: false, selected: 3, active: 3 }).label).toBe(
      "Neactivat — solicită activarea",
    );
    expect(properstarFeedStatus({ activated: true, selected: 0, active: 0 }).label).toBe(
      "Activat, dar niciun anunț bifat pentru Properstar",
    );
    expect(properstarFeedStatus({ activated: true, selected: 3, active: 3 }).label).toBe(
      "Inclus automat în feedul Properstar — 3 anunțuri",
    );
  });
});
