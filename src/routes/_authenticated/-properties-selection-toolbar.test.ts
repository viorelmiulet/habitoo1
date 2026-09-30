import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("property selection toolbar", () => {
  it("keeps website publication separate from portal bulk jobs", () => {
    const source = readFileSync("src/routes/_authenticated/app.properties.index.tsx", "utf8");
    expect(source).toContain("Publică pe site");
    expect(source).toContain("publishMany.mutate(selected)");
    expect(source).toContain('setPortalBulkMode("publish")');
    expect(source).toContain('setPortalBulkMode("withdraw")');
    const websiteButton = source.slice(source.indexOf('onClick={() => publishMany.mutate(selected)}'), source.indexOf('onClick={() => setPortalBulkMode("publish")}'));
    expect(websiteButton).not.toContain("startPortalBulkJob");
  });
});