import { describe, expect, it } from "vitest";
import { getPortalDefinition, portalCanPublish, publishUnavailableMessage } from "@/lib/portals/registry";
import { decideJobResult } from "@/lib/portals/publish-jobs.server";

describe("portal fără publicare implementată", () => {
  it("olx_direct (doar test_connection) nu poate fi publicat", () => {
    const def = getPortalDefinition("olx_direct")!;
    expect(def.capabilities).not.toContain("publish_listing");
    expect(def.capabilities).not.toContain("feed_pull");
    expect(portalCanPublish("olx_direct")).toBe(false);
    const msg = publishUnavailableMessage("olx_direct");
    expect(msg).toMatch(/publicarea nu este încă disponibilă\.$/);
    const d = decideJobResult({ attempts: 1 }, { portalId: "olx_direct", ok: false, action: "blocked", message: msg }, undefined);
    expect(d.status).toBe("error");
  });

  it("portalurile feed rămân publicabile", () => {
    for (const id of ["clickimob", "properstar", "homepitch"]) expect(portalCanPublish(id)).toBe(true);
  });
});
