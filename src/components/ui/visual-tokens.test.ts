import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROLE_NAMES = [
  "background",
  "surface",
  "border",
  "muted",
  "foreground",
  "muted-foreground",
  "faint",
  "primary",
  "gold-dark",
  "gold-tint",
  "success",
  "success-foreground",
  "destructive",
  "danger-tint",
  "neutral",
  "neutral-foreground",
  "sidebar",
  "sidebar-accent",
  "sidebar-foreground",
] as const;

describe("tokenii sistemului vizual", () => {
  it("definesc paleta o singură dată în fișierul global", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    for (const role of ROLE_NAMES) {
      expect(css).toMatch(new RegExp(`--${role}:\\s*#[0-9a-f]{6}\\b`, "i"));
    }
  });

  it("nu permit culorile paletei inline în componente", () => {
    const componentFiles = import.meta.glob("/src/components/**/*.{ts,tsx}", {
      eager: true,
      query: "?raw",
      import: "default",
    }) as Record<string, string>;
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const palette = css.match(/#[0-9a-f]{6}\b/gi) ?? [];
    const forbidden = new RegExp(`(?:${palette.join("|")})\\b`, "i");
    const offenders = Object.entries(componentFiles)
      .filter(([path]) => !path.endsWith("visual-tokens.test.ts"))
      .filter(([, source]) => forbidden.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
