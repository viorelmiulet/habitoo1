import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editPage = readFileSync(resolve(__dirname, "../../../routes/_authenticated/app.properties.$id.tsx"), "utf8");
const newPage = readFileSync(resolve(__dirname, "../../../routes/_authenticated/app.properties.new.tsx"), "utf8");

describe("panoul „Publicare” eliminat din formularul de proprietate", () => {
  it("pagina de editare nu mai afișează panoul Publicare și nici lista de portaluri din lateral", () => {
    expect(editPage).not.toContain("PropertyPublishSummaryCard");
    expect(editPage).not.toContain("PublishSummaryView");
    expect(editPage).not.toContain("data-sheet-publish");
    expect(editPage).not.toContain("selectate");
  });

  it("pagina de creare nu afișează panoul Publicare și nici lista de portaluri", () => {
    expect(newPage).not.toContain("PropertyPublishSummaryCard");
    expect(newPage).not.toContain("PublishSummaryView");
    expect(newPage).not.toContain("data-sheet-publish");
    expect(newPage).not.toContain("selectate");
  });

  it("tabul Promovare afișează în continuare portalurile", () => {
    expect(editPage).toContain("PropertyPortalsCard");
  });

  it("componenta panoului Publicare nu mai există", () => {
    expect(() => readFileSync(resolve(__dirname, "PropertyPublishSummaryCard.tsx"), "utf8")).toThrow();
    expect(() => readFileSync(resolve(__dirname, "sheet-publish.ts"), "utf8")).toThrow();
  });
});
