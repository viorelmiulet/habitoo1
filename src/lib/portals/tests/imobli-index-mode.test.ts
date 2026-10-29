import { describe, expect, it } from "vitest";
import { PORTALS } from "../registry";
import { assertPortalKeyAllowed } from "../key-policy";
import { portalConnectionReady } from "../clickimob/connection-ready";
import { AUTO_PULL_PORTALS } from "../republish";

describe("Imobli feed-only activation", () => {
  it("self-service sans clés par agence ni configuration", () => {
    const portal = PORTALS.find((p) => p.id === "imobli");
    expect(portal).toBeDefined();
    if (!portal) throw new Error("Missing Imobli");
    expect(portal.activation).toBe("self_service");
    expect(portal.authentication).toEqual(["none"]);
    expect(portal.directions).toEqual(["habitoo_to_portal"]);
    expect(portal.capabilities).toEqual(["publish_listing", "update_listing", "withdraw_listing", "feed_pull"]);
    expect(portal.configuration_schema.fields).toEqual([]);
    expect(() => assertPortalKeyAllowed(portal)).toThrow();
  });
  it("activated feed is ready without credentials, never a push republish", () => {
    expect(portalConnectionReady("imobli", { activated: true, status: "not_configured" })).toBe(true);
    expect(portalConnectionReady("imobli", { activated: false, status: "not_configured" })).toBe(false);
    expect(AUTO_PULL_PORTALS.has("imobli")).toBe(true);
  });
});