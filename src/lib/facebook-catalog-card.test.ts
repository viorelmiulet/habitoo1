import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { facebookCatalogState } from "@/lib/facebook-catalog-status";

const now = Date.parse("2026-10-03T12:00:00Z");
const ago = (h: number) => new Date(now - h * 3600_000).toISOString();

describe("starea Catalog Facebook", () => {
  it("Conectat: ultima cerere în 48h e 200", () => {
    expect(
      facebookCatalogState({ hasToken: true, now, logs: [{ status: 200, tokenPrefix: "hbs_x", createdAt: ago(3) }] }),
    ).toBe("connected");
  });
  it("Eroare: ultima cerere în 48h a eșuat", () => {
    expect(
      facebookCatalogState({
        hasToken: true,
        now,
        logs: [
          { status: 200, tokenPrefix: "a", createdAt: ago(10) },
          { status: 500, tokenPrefix: "a", createdAt: ago(1) },
        ],
      }),
    ).toBe("error");
  });
  it("401 fără token nu contează ca eroare", () => {
    expect(
      facebookCatalogState({
        hasToken: true,
        now,
        logs: [
          { status: 200, tokenPrefix: "a", createdAt: ago(10) },
          { status: 401, tokenPrefix: null, createdAt: ago(1) },
        ],
      }),
    ).toBe("connected");
  });
  it("Deconectat: fără token sau fără citire în 48h", () => {
    expect(facebookCatalogState({ hasToken: false, now, logs: [{ status: 200, tokenPrefix: "a", createdAt: ago(1) }] })).toBe("disconnected");
    expect(facebookCatalogState({ hasToken: true, now, logs: [{ status: 200, tokenPrefix: "a", createdAt: ago(49) }] })).toBe("disconnected");
    expect(facebookCatalogState({ hasToken: true, now, logs: [] })).toBe("disconnected");
  });
});

describe("acces și token", () => {
  const settings = readFileSync("src/routes/_authenticated/app.settings.tsx", "utf8");
  const fn = readFileSync("src/lib/facebook-catalog.functions.ts", "utf8");
  const card = readFileSync("src/components/app/FacebookCatalogCard.tsx", "utf8");

  it("fila Promovare e doar pentru admin (agentul nu o vede)", () => {
    expect(settings).toContain('{user?.isAdmin ? <TabsTrigger value="promotion">');
    expect(settings).toMatch(/user\?\.isAdmin \? \(\s*<TabsContent value="promotion">/);
  });
  it("serverul verifică rolul și nu citește tokenul/prefixul existent", () => {
    expect(fn).toContain('rpc("is_org_admin")');
    expect(fn).not.toMatch(/token_hash|token_prefix,|tokenPrefix:\s*row/);
    expect(fn).toMatch(/from\("site_feed_tokens"\)\s*\.select\("id"\)/);
  });
  it("cardul nu regenerează sau revocă și afișează doar modelul pentru tokenul existent", () => {
    expect(card).not.toContain("revokeSiteFeedToken");
    expect(card).toContain("?token=TOKENUL_TĂU");
    expect(card).not.toContain("tokenPrefix");
  });
});
