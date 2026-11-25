// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationPicker, emptyLocation, type LocationValue } from "./LocationPicker";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const COUNTIES = [
  { sirutaCode: 1, name: "Alba" }, { sirutaCode: 2, name: "București" },
  { sirutaCode: 3, name: "Ilfov" }, { sirutaCode: 4, name: "Timiș" },
];
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: { queryKey: unknown[] }) => ({ data: o.queryKey[0] === "ro-counties" ? COUNTIES : [], isLoading: false, isFetching: false }),
}));

let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function render(value: LocationValue = emptyLocation, onChange = vi.fn(), onPostalCode = vi.fn()) {
  await act(async () => root.render(<LocationPicker idPrefix="p" required value={value} onChange={onChange} onPostalCode={onPostalCode} />));
  return { onChange, onPostalCode };
}
const input = () => container.querySelector<HTMLInputElement>("#p-county")!;
async function type(v: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input(), v); input().dispatchEvent(new Event("input", { bubbles: true })); });
}
const options = () => [...container.querySelectorAll("#p-county-list [role=option]")].map((o) => o.textContent);

describe("LocationPicker — Județ", () => {
  it("fără text nu apare lista, nici la focus sau clic", async () => {
    await render();
    expect(container.querySelector("select")).toBeNull();
    expect(input().getAttribute("role")).toBe("combobox");
    await act(async () => { input().focus(); input().click(); });
    expect(container.querySelector("#p-county-list")).toBeNull();
  });
  it("„ilf” arată Ilfov; „bucuresti” găsește București; „timis” → Timiș", async () => {
    await render();
    await type("ilf"); expect(options()).toEqual(["Ilfov"]);
    await type("bucuresti"); expect(options()).toEqual(["București"]);
    await type("TIMIS"); expect(options()).toEqual(["Timiș"]);
    await type("zzz"); expect(container.querySelector("#p-county-list")?.textContent).toBe("Niciun județ găsit.");
  });
  it("Enter alege primul rezultat și golește localitatea", async () => {
    const { onChange } = await render();
    await type("i");
    await act(async () => { input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ countySirutaCode: 3, countyName: "Ilfov", uatSirutaCode: null, localitySirutaCode: null, localityName: "" });
  });
  it("cu județ existent se afișează caseta; ștergerea golește localitatea și codul poștal", async () => {
    const { onChange, onPostalCode } = await render({ countySirutaCode: 3, countyName: "Ilfov", uatSirutaCode: 9, localitySirutaCode: 10, localityName: "Voluntari" });
    expect(input()).toBeNull();
    expect(container.textContent).toContain("Ilfov");
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Șterge județul"]')!.click(); });
    expect(onChange).toHaveBeenLastCalledWith({ countySirutaCode: null, countyName: "", uatSirutaCode: null, localitySirutaCode: null, localityName: "" });
    expect(onPostalCode).toHaveBeenCalledWith(null);
  });
  it("județ obligatoriu lipsă blochează trimiterea chiar cu text tastat", async () => {
    await render(); await type("ilf");
    expect(input().checkValidity()).toBe(false);
  });
});
