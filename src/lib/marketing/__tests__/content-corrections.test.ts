import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const files = [
  "src/lib/marketing/public-faq.ts",
  "src/lib/marketing/content/intrebari-frecvente.md",
  "src/lib/marketing/comparison-content.ts",
  "src/lib/marketing/feature-pages.ts",
  "src/lib/marketing/blog-articles-2026-11.ts",
  "src/routes/intrebari-frecvente.tsx",
  "src/routes/llms[.]txt.ts",
  "src/routes/llms-full[.]txt.ts",
  ...readdirSync("drizzle/migrations").filter((f) => f.includes("blog")).map((f) => join("drizzle/migrations", f)),
];
const text = files.map((f) => readFileSync(f, "utf8")).join("\n");

describe("corecturi de conținut public", () => {
  it("nu afirmă numerotarea anuală a contractelor", () => {
    expect(text).not.toMatch(/numerotare anual|numere pe fiecare an/i);
  });
  it("nu menționează chatul din aplicație", () => {
    expect(text).not.toMatch(/chatul|Mesaje din meniu|bula/i);
  });
  it("FAQ-ul rămâne plat și fără grupul chat", async () => {
    const mod = await import("../public-faq");
    const groups = Object.values(mod).find((v) => Array.isArray(v) && (v as { id?: string }[])[0]?.id) as { id: string; faqs: { q: string; a: string }[] }[];
    expect(groups.some((g) => g.id === "chat")).toBe(false);
    for (const g of groups) for (const f of g.faqs) { expect(typeof f.q).toBe("string"); expect(typeof f.a).toBe("string"); }
  });
});
