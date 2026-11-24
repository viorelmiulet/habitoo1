import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("documentația OpenAPI publică", () => {
  it("fișierul public al feedului are același conținut ca sursa", () => {
    const source = readFileSync("src/lib/documentation-assets/feed.openapi.json", "utf8");
    const published = readFileSync("public/dezvoltatori/openapi.json", "utf8");
    expect(published).toBe(source);
  });
});
