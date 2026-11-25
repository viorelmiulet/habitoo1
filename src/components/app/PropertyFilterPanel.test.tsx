// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyFilterPanel } from "./PropertyFilterPanel";
import { emptyPropertyListFilters, type PropertyListFilters } from "@/lib/property-list-filters";

vi.mock("@/components/app/PortalLogo", () => ({ PortalLogoStack: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [{ id: "mrm", name: "MRM" }] }) }));
vi.mock("@/lib/developments", () => ({ developmentsOptions: () => ({}) }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const PORTAL_OPTIONS = [{ portalId: "storia", name: "Storia", pushSupported: true }];

async function render(applied: PropertyListFilters = emptyPropertyListFilters, onApply = vi.fn(), onTab = vi.fn()) {
  await act(async () => root.render(
    <PropertyFilterPanel applied={applied} placeValue="" onApply={onApply} onTab={onTab} onReset={vi.fn()}
      placeOptions={[]} showAgent={false} agentOptions={[]} portalOptions={PORTAL_OPTIONS} promotionGroups={[]} sources={[]} destinations={[]} />,
  ));
  return { onApply, onTab };
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing input setter");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("Control not found");
  await act(async () => { (el as HTMLElement).click(); });
};
const search = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Caută");

describe("PropertyFilterPanel", () => {
  it("bifa deblochează Ansamblu, se aplică la Caută și debifarea elimină selecția ansamblului", async () => {
    const { onApply } = await render();
    const toggle = [...container.querySelectorAll("label")].find((l) => l.textContent?.includes("Afișează anunțuri din ansambluri"))?.querySelector('[role="checkbox"]');
    const select = container.querySelector<HTMLButtonElement>("#pf-development");
    expect(select?.disabled).toBe(true);
    await click(toggle);
    expect(select?.disabled).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
    await click(search());
    expect(onApply.mock.calls.at(-1)?.[0]).toMatchObject({ showDevelopments: true, development: "all" });
    await render({ ...emptyPropertyListFilters, development: "mrm" }, onApply);
    await click(toggle);
    await click(search());
    expect(onApply.mock.calls.at(-1)?.[0]).toMatchObject({ showDevelopments: false, development: "all" });
  });
  it.each(["any", "mrm"])("leagă automat bifa de ansamblul %s din link", async (development) => {
    const { onApply } = await render({ ...emptyPropertyListFilters, development });
    await click(search());
    expect(onApply.mock.calls.at(-1)?.[0]).toMatchObject({ showDevelopments: true, development });
  });
  it("afișează câmpurile pe coloane în ordinea din captură", async () => {
    await render();
    const columns = [...container.querySelectorAll("[data-filter-column]")].map((col) =>
      [...col.querySelectorAll("[data-filter-row]")].map((row) => row.getAttribute("data-filter-row")));
    expect(columns).toEqual([
      ["Județ", "Localități", "Zonă", "Stradă"],
      ["Ansamblu", "Tip proprietate", "Tip tranzacție", "Camere", "Suprafață utilă", "Preț"],
      ["Valabilitate", "Adăugat între", "Modificat între", "Portaluri"],
      ["Cuvinte cheie", "Destinație", "Alte filtre"],
    ]);
    expect(container.querySelector("#pf-statuses")?.textContent).toBe("7 selectate");
  });

  it("rândul „Portaluri” e vizibil în coloana 3, sub „Modificat între”", async () => {
    await render();
    const row = container.querySelector('[data-filter-row="Portaluri"]');
    expect(row).not.toBeNull();
    expect(row?.parentElement?.getAttribute("data-filter-column")).toBe("3");
    expect(row?.previousElementSibling?.getAttribute("data-filter-row")).toBe("Modificat între");
    expect(row?.querySelector("#pf-portal")).not.toBeNull();
  });

  it("„Nepublicate · Storia” aplică filtrul portal la Caută", async () => {
    const { onApply } = await render();
    await click(container.querySelector("#pf-portal"));
    const option = document.body.querySelector('[cmdk-item][data-value="storia:unpublished"]');
    expect(option).not.toBeNull();
    await click(option);
    expect(container.querySelector("#pf-portal")?.textContent).toContain("Nepublicate · Storia");
    await click(search());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ portal: "storia:unpublished" });
  });

  it("contorul „Alte filtre” nu mai numără filtrul de portal", async () => {
    await render({ ...emptyPropertyListFilters, portal: "storia:unpublished" });
    expect(container.querySelector("#pf-other")?.textContent).toBe("Opțiuni");
  });

  it("modificarea unui câmp nu aplică filtrele; Caută și Enter le aplică", async () => {
    const { onApply } = await render();
    const street = container.querySelector<HTMLInputElement>("#pf-street");
    if (!street) throw new Error("Street input missing");
    await act(async () => type(street, "Unirii"));
    expect(onApply).not.toHaveBeenCalled();
    await click(search());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ street: "Unirii" });
    const form = container.querySelector("form");
    if (!form) throw new Error("Form missing");
    await act(async () => { form.requestSubmit(); });
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it("tab-ul se aplică imediat", async () => {
    const { onTab, onApply } = await render();
    const tab = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "Apartamente") as HTMLButtonElement;
    await act(async () => tab.click());
    expect(onTab).toHaveBeenCalledWith("apartments");
    expect(onApply).not.toHaveBeenCalled();
  });

  describe("restrângere", () => {
    const row = (label: string) => container.querySelector(`[data-filter-row="${label}"]`);
    const hidden = (label: string) => row(label)?.classList.contains("hidden");
    const toggle = () => container.querySelector('[data-tour="properties-filters-toggle"]');
    it("implicit restrâns: avansatele ascunse, cele de bază vizibile", async () => {
      await render();
      for (const l of ["Localități", "Zonă", "Stradă", "Camere", "Preț", "Valabilitate", "Portaluri", "Destinație", "Alte filtre"]) expect(hidden(l)).toBe(true);
      for (const l of ["Județ", "Ansamblu", "Tip proprietate", "Tip tranzacție", "Cuvinte cheie"]) expect(hidden(l)).toBe(false);
      expect(toggle()?.className).not.toContain("md:hidden");
      expect(toggle()?.textContent).toBe("Mai multe filtre");
    });
    it("primul clic arată, al doilea ascunde", async () => {
      await render();
      await click(toggle());
      expect(hidden("Preț")).toBe(false);
      expect(toggle()?.textContent).toBe("Mai puține filtre");
      await click(toggle());
      expect(hidden("Preț")).toBe(true);
    });
    it("cu filtre avansate active rămâne restrâns și arată numărul", async () => {
      await render({ ...emptyPropertyListFilters, priceMin: "100", rooms: "2", destination: "Birouri" });
      expect(hidden("Preț")).toBe(true);
      expect(toggle()?.textContent).toBe("Mai multe filtre (3)");
    });
    it("Caută nu schimbă starea", async () => {
      const { onApply } = await render();
      await click(search());
      expect(onApply).toHaveBeenCalled();
      expect(hidden("Preț")).toBe(true);
      await click(toggle());
      await click(search());
      expect(hidden("Preț")).toBe(false);
    });
  });
});
