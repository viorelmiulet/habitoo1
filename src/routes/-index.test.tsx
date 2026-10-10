import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pagina principală", () => {
  it("conține mesajul principal și acțiunile esențiale", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

    expect(source).toContain("CRM imobiliar care transformă cererile și proprietățile în");
    expect(source).toContain("tranzacții închise.");
    expect(source).toContain("Începe acum");
    expect(source).toContain("Autentificare");
  });
});