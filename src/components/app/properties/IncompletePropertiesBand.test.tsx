// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params, search, to: _to, ...rest }: { children: React.ReactNode; params: { id: string }; search: { edit: boolean }; to: string }) =>
    <a href={`/app/properties/${params.id}?edit=${String(search.edit)}`} {...rest}>{children}</a>,
}));
import { IncompletePropertiesBand, sortIncomplete, type IncompleteProperty } from "./IncompletePropertiesBand";

const item = (i: number, missing: string[]): IncompleteProperty => ({ id: `p${i}`, reference: `RF-${i}`, title: `Titlu ${i}`, missing });
let container: HTMLDivElement; let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ""; });
const show = (items: IncompleteProperty[]) => act(() => root.render(<IncompletePropertiesBand items={items} />));
const openPanel = () => {
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Completează cu AI")!;
  act(() => btn.click());
  return document.querySelector('[role="dialog"]')!;
};

describe("Fișe incomplete", () => {
  it("butonul deschide panoul cu atâtea rânduri câte arată banda, lipsuri și link de editare", () => {
    show([item(1, ["dotările"]), item(2, ["etajul", "dotările"])]);
    expect(container.querySelector('[data-testid="properties-ai-band"]')!.textContent).toContain("2 fișe incomplete");
    const dialog = openPanel();
    expect(dialog.textContent).toContain("Fișe incomplete");
    const rows = dialog.querySelectorAll('[data-testid="incomplete-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Lipsesc: etajul, dotările");
    expect(rows[0]!.querySelector("a")!.getAttribute("href")).toBe("/app/properties/p2?edit=true");
    expect(rows[0]!.querySelector("a")!.textContent).toBe("Completează");
    expect(rows[1]!.textContent).toContain("Lipsesc: dotările");
  });
  it("fără fișe incomplete banda nu apare", () => {
    show([]);
    expect(container.innerHTML).toBe("");
  });
  it("ordine după numărul de lipsuri, apoi referință; maximum 100 și „și încă N”", () => {
    const items = Array.from({ length: 103 }, (_, i) => item(i + 1, i === 50 ? ["a", "b", "c"] : ["a"]));
    const { shown, more } = sortIncomplete(items);
    expect(shown).toHaveLength(100);
    expect(more).toBe(3);
    expect(shown.slice(0, 3).map((x) => x.reference)).toEqual(["RF-51", "RF-1", "RF-2"]);
    show(items);
    const dialog = openPanel();
    expect(dialog.querySelectorAll('[data-testid="incomplete-row"]')).toHaveLength(100);
    expect(dialog.textContent).toContain("și încă 3");
  });
  it("interogarea listei și exportul nu mai depind de bandă", () => {
    const src = readFileSync("src/routes/_authenticated/app.properties.index.tsx", "utf8");
    expect(src).not.toMatch(/onlyIncomplete|incompleteIds|Arată toate/);
  });
});
