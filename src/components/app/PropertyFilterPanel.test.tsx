// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyFilterPanel } from "./PropertyFilterPanel";
import { emptyPropertyListFilters } from "@/lib/property-list-filters";

vi.mock("@/components/app/PortalLogo", () => ({ PortalLogoStack: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(onApply = vi.fn(), onTab = vi.fn()) {
  await act(async () => root.render(
    <PropertyFilterPanel applied={emptyPropertyListFilters} placeValue="" onApply={onApply} onTab={onTab} onReset={vi.fn()}
      placeOptions={[]} showAgent={false} agentOptions={[]} portalOptions={[]} promotionGroups={[]} sources={[]} destinations={[]} />,
  ));
  return { onApply, onTab };
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PropertyFilterPanel", () => {
  it("afișează câmpurile pe coloane în ordinea din captură", async () => {
    await render();
    const columns = [...container.querySelectorAll("[data-filter-column]")].map((col) =>
      [...col.querySelectorAll("[data-filter-row]")].map((row) => row.getAttribute("data-filter-row")));
    expect(columns).toEqual([
      ["Județ", "Localități", "Zonă", "Stradă"],
      ["Tip proprietate", "Tip tranzacție", "Camere", "Suprafață utilă", "Preț"],
      ["Valabilitate", "Adăugat între", "Modificat între"],
      ["Cuvinte cheie", "Destinație", "Promovare", "Alte filtre"],
    ]);
    expect(container.querySelector("#pf-statuses")?.textContent).toBe("7 selectate");
  });

  it("modificarea unui câmp nu aplică filtrele; Caută și Enter le aplică", async () => {
    const { onApply } = await render();
    const street = container.querySelector<HTMLInputElement>("#pf-street")!;
    await act(async () => type(street, "Unirii"));
    expect(onApply).not.toHaveBeenCalled();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Caută")!;
    await act(async () => button.click());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ street: "Unirii" });
    const form = container.querySelector("form")!;
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
});
