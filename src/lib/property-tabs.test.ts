import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propertyTabFromSearch } from "./property-tabs";

const page = readFileSync("src/routes/_authenticated/app.properties.$id.tsx", "utf8");

describe("fila Promovare a fișei", () => {
  it.each(["publishing", "promotion"])("?tab=%s deschide fila Promovare", (tab) => {
    expect(propertyTabFromSearch(tab)).toBe("publishing");
  });
  it("fără tab cunoscut se deschide Caracteristici", () => {
    expect(propertyTabFromSearch(undefined)).toBe("overview");
  });
  it.each(["overview", "leads", "activities", "marketing"])("?tab=%s deschide Caracteristici", (t) => {
    expect(propertyTabFromSearch(t)).toBe("overview");
  });
  it("are exact cele 11 file, în ordine", () => {
    const list = page.slice(page.indexOf("<TabsList"), page.indexOf("</TabsList>"));
    const labels = [...list.matchAll(/\["(\w+)", [`"]([^`"(]+)/g)].map((m) => m[2].trim());
    expect(labels).toEqual(["Agent", "Localizare", "Descriere", "Preț", "Caracteristici", "Fotografii", "Promovare", "Matching", "Documente", "ACP", "Istoric"]);
    for (const old of ['value="leads"', 'value="activities"', 'value="marketing"']) expect(page).not.toContain(old);
    expect(page).toContain("/app/leads?proprietate=${id}");
  });
  it.each([["description", "<PropertyTitleDescriptionPanel"], ["price", "<PropertyTransactionFields"]])("fila %s salvează prin aceeași funcție, fără dubluri", (value, panel) => {
    const start = page.indexOf(`<TabsContent value="${value}"`);
    const body = page.slice(start, page.indexOf("</TabsContent>", start));
    expect(body).toContain(panel);
    expect(body).toContain("save.mutate(buildEditPatch())");
    expect(page.split(panel).length - 1).toBe(1);
    expect(propertyTabFromSearch(value)).toBe(value);
  });
  it("Localizare este înaintea Prezentării și salvează localizarea prin aceeași funcție", () => {
    expect(propertyTabFromSearch("location")).toBe("location");
    expect(page.indexOf('["location", "Localizare"]')).toBeLessThan(page.indexOf('["overview", "Caracteristici"]'));
    const location = page.slice(page.indexOf('<TabsContent value="location"'), page.indexOf('<TabsContent value="description"'));
    for (const id of ['id="district"', 'id="address"', 'id="postal_code"', "<LocationPicker", "<PropertyLocationMap"]) expect(location).toContain(id);
    expect(location).toContain("save.mutate(buildEditPatch())");
    expect(page).toContain('if (!INLINE_EDIT_TABS.has(tab)) setTab("overview")');
    expect(page).toContain("Locație</h2>");
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
