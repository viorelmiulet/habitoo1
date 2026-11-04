/**
 * @vitest-environment jsdom
 *
 * Etajul acceptă valori negative (fără tastatură „decimal” fără minus), iar
 * eroarea de validare apare/dispare prin starea React, fără erori în consolă.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { HintedForm } from "@/components/app/HintedForm";
import { Input } from "@/components/ui/input";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Host() {
  const [floor, setFloor] = useState("");
  return (
    <HintedForm onSubmit={(e) => e.preventDefault()}>
      <Input id="p-floor" type="number" min={-5} required value={floor} onChange={(e) => setFloor(e.target.value)} />
      <button type="submit">Salvează</button>
    </HintedForm>
  );
}

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("HintedForm", () => {
  it("etajul acceptă -2, eroarea apare și dispare după corectare", () => {
    const consoleError = vi.spyOn(console, "error");
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Host />));
    const input = container.querySelector<HTMLInputElement>("#p-floor")!;
    expect(input.getAttribute("inputmode")).toBeNull();

    act(() => { input.form!.requestSubmit(); });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("p.text-destructive")).not.toBeNull();

    act(() => setValue(input, "-2"));
    expect(input.value).toBe("-2");
    expect(input.checkValidity()).toBe(true);
    expect(container.querySelector("p.text-destructive")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();

    act(() => setValue(input, ""));
    act(() => { input.form!.requestSubmit(); });
    expect(container.querySelector("p.text-destructive")).not.toBeNull();
    act(() => setValue(input, "3"));
    expect(container.querySelector("p.text-destructive")).toBeNull();

    act(() => root.unmount());
    expect(consoleError).not.toHaveBeenCalled();
  });
});
