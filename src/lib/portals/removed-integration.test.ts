import { describe, expect, it } from "vitest";
import { agencySettingsPortals, getPortalDefinition, portalCanPublish } from "./registry";
import { integrationPageBySlug, integrationSlugFor } from "./integration-pages";
import { PORTAL_REQUIREMENTS } from "./requirements";
import { isTimeoutRetryPortal } from "./transient-failure";

describe("removed publishing integration", () => {
  it("OferteImobiliare.ro cannot be selected, published, retried or resolved as an integration page", () => {
    const id = "oferteimobiliare";
    expect(getPortalDefinition(id)).toBeNull();
    expect(agencySettingsPortals().some((portal) => portal.id === id)).toBe(false);
    expect(portalCanPublish(id)).toBe(false);
    expect(PORTAL_REQUIREMENTS[id]).toBeUndefined();
    expect(isTimeoutRetryPortal(id)).toBe(false);
    expect(integrationSlugFor(id)).toBeNull();
    expect(integrationPageBySlug("oferte-imobiliare")).toBeNull();
  });
});