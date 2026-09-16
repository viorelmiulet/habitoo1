/**
 * @vitest-environment jsdom
 *
 * Regresie: câmpurile formularului de proprietate nu trebuie demontate la
 * fiecare schimbare. Dacă ar fi definite în corpul componentei părinte, React
 * ar remonta tot formularul → pierderea focusului la tastare și saltul
 * poziției de derulare la bifarea unui checkbox.
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  PropertyDetailsFields,
  type PropertyDetailsValue,
} from "@/components/app/PropertyDetailsFields";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Host() {
  const [value, setValue] = useState<PropertyDetailsValue>({});
  return (
    <PropertyDetailsFields
      value={value}
      onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
    />
  );
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Host />);
  });
  // Secțiunile sunt un acordeon: îl deschidem ca un utilizator real.
  const trigger = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Detalii",
  ) as HTMLButtonElement;
  await act(async () => {
    trigger.click();
  });
  return { container, root };
}

function setInputValue(input: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PropertyDetailsFields", () => {
  it("păstrează focusul și aceleași noduri DOM la tastare în câmpuri numerice", async () => {
    const { container, root } = await mount();
    const input = container.querySelector<HTMLInputElement>("#det-build_year");
    expect(input).toBeTruthy();
    input!.focus();
    expect(document.activeElement).toBe(input);

    for (const digits of ["1", "19", "199", "1998"]) {
      await act(async () => {
        setInputValue(input!, digits);
      });
      // Același nod: nu s-a remontat nimic.
      expect(container.querySelector("#det-build_year")).toBe(input);
      expect(document.activeElement).toBe(input);
    }
    expect(input!.value).toBe("1998");

    await act(async () => root.unmount());
  });

  it("bifarea unui checkbox nu remontează celelalte câmpuri", async () => {
    const { container, root } = await mount();
    const input = container.querySelector<HTMLInputElement>("#det-build_year")!;
    const checkbox = container.querySelector<HTMLButtonElement>("#det-balcony")!;
    const otherCheckbox = container.querySelector<HTMLButtonElement>("#det-pet_friendly")!;
    input.focus();

    await act(async () => {
      checkbox.click();
    });

    expect(checkbox.getAttribute("data-state")).toBe("checked");
    // Nodurile din secțiune rămân identice → poziția de derulare nu se resetează.
    expect(container.querySelector("#det-build_year")).toBe(input);
    expect(container.querySelector("#det-balcony")).toBe(checkbox);
    expect(container.querySelector("#det-pet_friendly")).toBe(otherCheckbox);
    expect(document.activeElement).toBe(input);

    await act(async () => root.unmount());
  });
});
