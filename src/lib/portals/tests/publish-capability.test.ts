import { describe, expect, it } from "vitest";
import { getPortalDefinition, portalCanPublish, publishUnavailableMessage } from "@/lib/portals/registry";
import { decideJobResult } from "@/lib/portals/publish-jobs.server";

describe("portal fără publicare implementată", () => {
  it("un portal fără publish_listing și fără feed_pull nu poate fi publicat", () => {
    const def = getPortalDefinition("olx")!;
    expect(def.capabilities).not.toContain("publish_listing");
    expect(def.capabilities).not.toContain("feed_pull");
    expect(portalCanPublish("olx")).toBe(false);
    const msg = publishUnavailableMessage("olx");
    expect(msg).toMatch(/publicarea nu este încă disponibilă\.$/);
    const d = decideJobResult({ attempts: 1 }, { portalId: "olx", ok: false, action: "blocked", message: msg }, undefined);
    expect(d.status).toBe("error");
  });

  it("portalurile feed rămân publicabile", () => {
    for (const id of ["clickimob", "properstar", "homepitch", "olx_direct"]) expect(portalCanPublish(id)).toBe(true);
  });
});
