import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("portal publication wording", () => {
  it("keeps the detailed property states aligned", () => {
    const source = read("src/components/app/PropertyPortalsCard.tsx");

    expect(source).toContain('published: { label: "Publicat"');
    expect(source).toContain('in_feed: { label: "Publicat"');
    expect(source).toContain('not_selected: { label: "Nepublicat"');
    expect(source).toContain('withdrawn: { label: "Nepublicat"');
    expect(source).toContain('error: { label: "Refuzat"');
    expect(source).toContain('expired: { label: "Expirat"');
    expect(source).toContain('selected: { label: "Selectat"');
    expect(source).toContain('not_configured: { label: "Neconfigurat"');
    expect(source).toContain('syncing: { label: "Se sincronizează"');
  });

  it("does not use feed terminology in visible publication literals", () => {
    const sources = [
      "src/components/app/PropertyPortalsCard.tsx",
      "src/components/app/PropertyPublishView.tsx",
      "src/lib/property-list-row.ts",
      "src/components/app/PortalBulkProgress.tsx",
    ].map(read).join("\n");
    const forbidden = [
      "Activ în feed",
      "în feed",
      "Intră în feed",
      "Iese din feed",
      "Activ pe portal",
    ];

    for (const wording of forbidden) expect(sources).not.toContain(`"${wording}"`);
  });
});