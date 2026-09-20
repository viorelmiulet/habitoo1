import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PALETTE = [
  "F7F4EE",
  "FFFFFF",
  "E4DED2",
  "FBF9F5",
  "14171C",
  "5E6570",
  "8A9099",
  "C08A3E",
  "8A5D1C",
  "F6EFE2",
  "1F5138",
  "E3EFE7",
  "8A2F24",
  "F6E4E1",
  "4A5059",
  "EFEBE2",
  "171B21",
  "262C35",
  "D5D1C8",
] as const;

describe("tokenii sistemului vizual", () => {
  it("definesc paleta o singură dată în fișierul global", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").toUpperCase();
    for (const hex of PALETTE) expect(css).toContain(`#${hex}`);
  });

  it("nu permit culorile paletei inline în componente", () => {
    const componentFiles = import.meta.glob("/src/components/**/*.{ts,tsx}", {
      eager: true,
      query: "?raw",
      import: "default",
    }) as Record<string, string>;
    const forbidden = new RegExp(`#(?:${PALETTE.join("|")})\\b`, "i");
    const offenders = Object.entries(componentFiles)
      .filter(([path]) => !path.endsWith("visual-tokens.test.ts"))
      .filter(([, source]) => forbidden.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
