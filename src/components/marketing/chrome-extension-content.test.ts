import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "@/lib/blog-discovery";
import { chromeInstallButton, extensionInstalledVersion, CHROME_EXTENSION_URL } from "./chrome-extension-content";

describe("extensie Chrome — pagina publică", () => {
  it("apare în sitemap", () => {
    expect(buildSitemapXml([], new Date("2026-11-09T00:00:00Z"))).toContain("<loc>https://www.habitoo.ro/extensie-chrome</loc>");
  });
  it("butonul „Adaugă în Chrome” e activ și duce la Chrome Web Store", () => {
    expect(CHROME_EXTENSION_URL).toBe("https://chromewebstore.google.com/detail/halmjojklfjnnmjojpeboeaopkabmlee");
    expect(chromeInstallButton()).toEqual({ disabled: false, label: "Adaugă în Chrome", href: CHROME_EXTENSION_URL });
    expect(chromeInstallButton("")).toEqual({ disabled: true, label: "În curând în Chrome Web Store", href: null });
  });

  it("detectează extensia instalată din atributul data-habitoo-extension", () => {
    expect(extensionInstalledVersion("1.2.3")).toBe("1.2.3");
    expect(extensionInstalledVersion(" 1.0 ")).toBe("1.0");
    expect(extensionInstalledVersion("")).toBeNull();
    expect(extensionInstalledVersion(null)).toBeNull();
    expect(extensionInstalledVersion(undefined)).toBeNull();
  });
});
