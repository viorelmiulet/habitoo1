import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHROME_EXTENSION_PATH, CHROME_EXTENSION_URL } from "@/components/marketing/chrome-extension-content";
import { HOME_EXTENSION } from "./home-content";

describe("secțiunea Habitoo Catch de pe homepage", () => {
  it("textele secțiunii sunt definite și în română", () => {
    expect(HOME_EXTENSION.title).toBe("Habitoo Catch: anunțuri preluate dintr-un click");
    expect(HOME_EXTENSION.bullets).toHaveLength(3);
    expect(HOME_EXTENSION.description).toContain("Proprietarul se salvează automat ca contact");
  });

  it("secțiunea folosește CHROME_EXTENSION_URL și pagina publică a extensiei, nu URL-uri scrise de mână", () => {
    const source = readFileSync(fileURLToPath(new URL("./HomeContent.tsx", import.meta.url)), "utf8");
    expect(source).toContain("CHROME_EXTENSION_URL");
    expect(source).toContain("CHROME_EXTENSION_PATH");
    expect(source).not.toContain("chromewebstore.google.com");
    expect(CHROME_EXTENSION_URL).toContain("chromewebstore.google.com/detail/habitoo-catch/");
    expect(CHROME_EXTENSION_PATH).toBe("/extensie-chrome");
  });
});
