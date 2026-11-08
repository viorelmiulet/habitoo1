import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "@/lib/blog-discovery";
import { chromeInstallButton, CHROME_EXTENSION_URL } from "./chrome-extension-content";

describe("extensie Chrome — pagina publică", () => {
  it("apare în sitemap", () => {
    expect(buildSitemapXml([], new Date("2026-11-09T00:00:00Z"))).toContain("<loc>https://www.habitoo.ro/extensie-chrome</loc>");
  });
  it("butonul e dezactivat cât timp CHROME_EXTENSION_URL e gol", () => {
    expect(CHROME_EXTENSION_URL).toBe("");
    expect(chromeInstallButton()).toEqual({ disabled: true, label: "În curând în Chrome Web Store", href: null });
    expect(chromeInstallButton("https://chromewebstore.google.com/detail/x").disabled).toBe(false);
  });
});
