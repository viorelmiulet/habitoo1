/**
 * @vitest-environment jsdom
 *
 * Regresie: câmpurile formularului de proprietate nu trebuie demontate la
 * fiecare schimbare. Dacă ar fi definite în corpul componentei părinte, React
 * ar remonta tot formularul → pierderea focusului la tastare și saltul
 * poziției de derulare la bifarea unui checkbox.
 */
import { afterEach, describe, expect, it } from "vitest";
import { PropertyFeatureSections, filterFeatureSections } from "@/components/app/PropertyFeatureSections";
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
  );
  if (!trigger) throw new Error("Missing details trigger");
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
    if (!input) throw new Error("Missing build year field");
    input.focus();
    expect(document.activeElement).toBe(input);

    for (const digits of ["1", "19", "199", "1998"]) {
      await act(async () => {
        setInputValue(input, digits);
      });
      // Același nod: nu s-a remontat nimic.
      expect(container.querySelector("#det-build_year")).toBe(input);
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe("1998");

    await act(async () => root.unmount());
  });

  it("bifarea unui checkbox nu remontează celelalte câmpuri", async () => {
    const { container, root } = await mount();
    const input = container.querySelector<HTMLInputElement>("#det-build_year");
    const checkbox = container.querySelector<HTMLButtonElement>("#det-balcony");
    const otherCheckbox = container.querySelector<HTMLButtonElement>("#det-pet_friendly");
    if (!input || !checkbox || !otherCheckbox) throw new Error("Missing detail controls");
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


afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

async function mountFeatures(initial: PropertyDetailsValue = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let saved = initial;
  function FeatureHost() {
    const [value, setValue] = useState(initial);
    return <PropertyFeatureSections value={value} onChange={(patch) => {
      saved = { ...saved, ...patch };
      setValue((current) => ({ ...current, ...patch }));
    }} />;
  }
  await act(async () => root.render(<FeatureHost />));
  return { container, root, saved: () => saved };
}

function control(container: HTMLElement, id: string) {
  const node = container.querySelector<HTMLButtonElement>(`[id="${id}"]`);
  if (!node) throw new Error(`Missing control ${id}`);
  return node;
}

describe("property feature selections", () => {
  it("parchet retains only the floor options, ignoring case and diacritics", () => {
    const results = filterFeatureSections("PARCHET");
    expect(results.flatMap((section) => section.groups.map((group) => group.field))).toEqual(["floor_finishes"]);
    expect(results[0]?.groups[0]?.options).toEqual(["Parchet"]);
    expect(filterFeatureSections("incalzire")[0]?.groups[0]?.options).toEqual(["Încălzire pardoseală"]);
  });

  it("checkboxes preserve existing field keys and exact taxonomy values without remounting", async () => {
    const { container, root, saved } = await mountFeatures({ floor_finishes: ["Gresie"] });
    const checkbox = control(container, "features-floor_finishes-Parchet");
    checkbox.focus();
    await act(async () => checkbox.click());
    expect(saved().floor_finishes).toEqual(["Gresie", "Parchet"]);
    expect(control(container, "features-floor_finishes-Parchet")).toBe(checkbox);
    expect(document.activeElement).toBe(checkbox);
    await act(async () => checkbox.click());
    expect(saved().floor_finishes).toEqual(["Gresie"]);
    await act(async () => root.unmount());
  });

  it.each([
    ["finish_state", "Finisat", "Renovat"],
    ["furnishing", "Complet", "Nemobilat"],
  ])("%s stays single choice and can be cleared", async (field, first, second) => {
    const { container, root, saved } = await mountFeatures({ [field]: first });
    await act(async () => control(container, `features-${field}-${second}`).click());
    expect(saved()[field]).toBe(second);
    expect(control(container, `features-${field}-${first}`).getAttribute("aria-checked")).toBe("false");
    const clear = container.querySelector<HTMLButtonElement>(`[aria-label="Șterge selecția ${field === "finish_state" ? "Stare" : "Mobilat"}"]`);
    if (!clear) throw new Error("Missing clear action");
    await act(async () => clear.click());
    expect(saved()[field]).toBeNull();
    await act(async () => root.unmount());
  });

  it("read-only groups contain only saved options and omit empty fields", () => {
    const results = filterFeatureSections("", { floor_finishes: ["Parchet"], furnishing: "Complet", utilities: [] });
    expect(results.flatMap((section) => section.groups.map((group) => [group.field, group.options]))).toEqual([
      ["floor_finishes", ["Parchet"]], ["furnishing", ["Complet"]],
    ]);
  });
});
