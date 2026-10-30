import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propertyTabFromSearch } from "./property-tabs";

const page = readFileSync("src/routes/_authenticated/app.properties.$id.tsx", "utf8");

describe("fila Promovare a fișei", () => {
  it.each(["publishing", "promotion"])("?tab=%s deschide fila Promovare", (tab) => {
    expect(propertyTabFromSearch(tab)).toBe("publishing");
  });
  it("fără tab cunoscut se deschide Prezentare", () => {
    expect(propertyTabFromSearch(undefined)).toBe("overview");
  });
  it("fila conține portalurile și instrumentele de promovare; nu mai există fila veche", () => {
    const tab = page.slice(page.indexOf('value="publishing"'), page.indexOf('<TabsContent value="history">'));
    expect(tab).toContain("<PropertyPortalsCard");
    expect(tab).toContain("<PropertyPromotionTab");
    expect(page).not.toContain('value="promotion"');
    expect(page).toContain('["publishing", `Promovare (');
    expect(page).not.toMatch(/Accordion/);
  });
});
