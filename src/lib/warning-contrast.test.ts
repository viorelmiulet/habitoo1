import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
function block(sel: string) {
  const m = css.match(new RegExp(`(^|\\n)${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(sel);
  const vars: Record<string, string> = {};
  for (const [, k, v] of m[2].matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
  return vars;
}
const root = block(":root");
const dark = { ...root, ...block(".dark") };
function resolve(vars: Record<string, string>, name: string): string {
  let v = vars[name];
  for (let i = 0; i < 5 && v?.startsWith("var("); i++) v = vars[v.slice(6, -1)];
  if (!/^#[0-9a-f]{6}$/i.test(v ?? "")) throw new Error(`${name}=${v}`);
  return v;
}
function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe.each([["light", root], ["dark", dark]] as const)("contrast avertisment (%s)", (_t, v) => {
  it.each(["card", "background", "gold-tint"])("warning-foreground pe %s ≥ 4.5", (bg) => {
    expect(ratio(resolve(v, "warning-foreground"), resolve(v, bg))).toBeGreaterThanOrEqual(4.5);
  });
  it("gold-foreground pe warning ≥ 4.5", () => {
    expect(ratio(resolve(v, "gold-foreground"), resolve(v, "warning"))).toBeGreaterThanOrEqual(4.5);
  });
});
