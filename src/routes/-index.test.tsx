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
describe("numărul de portaluri pe prima pagină", () => {
  it("folosește numărul calculat, nu o cifră scrisă de mână", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toContain("o publici pe {publicPortalCount()} portaluri, mai multe decât în orice alt CRM imobiliar din România");
  });
});
