import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Setări pe telefon", () => {
  const settings = readFileSync("src/routes/_authenticated/app.settings.tsx", "utf8");
  const facebook = readFileSync("src/components/app/FacebookCatalogCard.tsx", "utf8");

  it("ține filele pe un singur rând cu derulare proprie și centrează fila activă", () => {
    expect(settings).toContain("data-settings-tabs");
    expect(settings).toMatch(/data-settings-tabs[\s\S]*overflow-x-auto overflow-y-hidden/);
    expect(settings).toMatch(/data-settings-tabs[\s\S]*<\/TabsList>/);
    expect(settings).toContain('inline: "center"');
    expect(settings).toContain('querySelector<HTMLElement>(\'[data-state="active"]\')');
  });

  it("izolează lățimea paginii și păstrează estomparea marginilor", () => {
    expect(settings).toMatch(/data-settings-root className="[^"]*min-w-0[^"]*max-w-full[^"]*overflow-x-hidden/);
    expect(settings).toContain("after:bg-gradient-to-l");
    expect(settings).toContain("before:bg-gradient-to-r");
  });

  it("adresa Catalogului Facebook și acțiunile nu lărgesc pagina", () => {
    expect(facebook).toContain("w-full min-w-0 max-w-full flex-1 truncate");
    expect(facebook).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(facebook).toContain("max-w-full whitespace-normal");
  });
});