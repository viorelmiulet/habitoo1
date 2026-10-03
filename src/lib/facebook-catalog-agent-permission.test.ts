import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canEditFacebookCatalog } from "@/lib/facebook-catalog-listings.functions";

describe("permisiunea agenților pentru Catalog Facebook", () => {
  it("blochează agentul implicit și îl permite doar când setarea este pornită", () => {
    expect(canEditFacebookCatalog(true, false)).toBe(false);
    expect(canEditFacebookCatalog(true, true)).toBe(true);
  });

  it("administratorul poate modifica anunțurile indiferent de setare", () => {
    expect(canEditFacebookCatalog(false, false)).toBe(true);
    expect(canEditFacebookCatalog(false, true)).toBe(true);
  });

  it("aplică 403 pe server și păstrează bulk doar pentru administrator", () => {
    const source = readFileSync("src/lib/facebook-catalog-listings.functions.ts", "utf8");
    expect(source).toMatch(/canEditFacebookCatalog\(agentOnly,[\s\S]*setResponseStatus\(403\)/);
    expect(source).toMatch(/bulkSetFacebookCatalog[\s\S]*rpc\("is_org_admin"\)/);
    expect(source).toContain("assertPortalPropertyAccess");
  });

  it("afișează setarea doar în varianta Portaluri și mesajul agentului", () => {
    const card = readFileSync("src/components/app/FacebookCatalogCard.tsx", "utf8");
    const publishing = readFileSync("src/components/app/PropertyPortalsCard.tsx", "utf8");
    expect(card).toContain("{portalList ? (");
    expect(card).toContain("Agenții pot adăuga anunțuri în Catalog Facebook");
    expect(publishing).toContain("Doar managerul agenției poate adăuga anunțuri în Catalog Facebook.");
    expect(publishing).toContain("!canEditFacebookCatalog");
  });

  it("dezactivarea setării nu modifică rândurile de publicare", () => {
    const source = readFileSync("src/lib/facebook-catalog.functions.ts", "utf8");
    const handler = source.slice(source.indexOf("setFacebookCatalogAgentPermission"));
    expect(handler).toContain('.from("organizations")');
    expect(handler).not.toContain('.from("portal_publications")');
  });
});