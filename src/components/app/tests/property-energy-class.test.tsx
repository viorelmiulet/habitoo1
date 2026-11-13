// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { PropertyDetailsFields } from "../PropertyDetailsFields";
import { computeCompleteness, completenessInputFromRow, missingRequiredMessage } from "@/lib/property-completeness";
import { PROPERTY_DETAIL_FIELDS } from "@/lib/property-detail-fields";
import { ENERGY_CLASS_OPTIONS, normalizeEnergyClass } from "@/lib/property-energy-class";

// Exercise the shared field's value contract without Radix's pointer/layout requirements.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) =>
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const complete = {
  property_type: "apartment", title: "Apartament", for_sale: true, for_rent: false,
  sale_price: 120000, city: "București", assigned_to: "agent-1", usable_surface: 72,
  description: "x".repeat(400), rooms: 3, lat: 44.4, lng: 26.1,
};
const media = { imageCount: 8, hasCover: true, hasContract: true };

describe("energy class in the shared create/edit form", () => {
  it("writes the existing optional field, reaches 100%, and permits clearing it", async () => {
    let saved: Record<string, unknown> = { ...complete, energy_class: null };
    function Host() {
      const [value, setValue] = useState(saved);
      return <PropertyDetailsFields value={value} onChange={(patch) => {
        saved = { ...saved, ...patch };
        setValue(saved);
      }} />;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Host />));
      const select = Array.from(container.querySelectorAll("select")).find((s) =>
        Array.from(s.options).some((o) => o.value === "A++"));
      if (!select) throw new Error("Missing energy class selector");
      expect(PROPERTY_DETAIL_FIELDS.includes("energy_class")).toBe(true);
      const before = computeCompleteness(completenessInputFromRow(saved, media));
      expect(before.percent).toBeLessThan(100);
      expect(missingRequiredMessage(before)).toBeNull();
      await act(async () => {
        select.value = "B";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(saved.energy_class).toBe("B");
      expect(computeCompleteness(completenessInputFromRow(saved, media)).percent).toBe(100);
      await act(async () => {
        select.value = "__none__";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(saved.energy_class).toBeNull();
      expect(missingRequiredMessage(computeCompleteness(completenessInputFromRow(saved, media)))).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("loads an existing energy class into the edit draft", () => {
    const property = { ...complete, energy_class: "A+" };
    const draft = Object.fromEntries(PROPERTY_DETAIL_FIELDS.map((key) => [key, (property as Record<string, unknown>)[key] ?? null]));
    expect(draft.energy_class).toBe("A+");
    expect(computeCompleteness(completenessInputFromRow({ ...property, ...draft }, media)).percent).toBe(100);
  });
});

describe("energy class normalization and checklist state", () => {
  async function renderForm(initial: Record<string, unknown>) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<PropertyDetailsFields value={initial} onChange={() => undefined} />));
    const select = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "A++"));
    if (!select) throw new Error("Missing energy class selector");
    return { container, root, select };
  }

  it("checks the checklist item when a class is saved and unchecks it for Nespecificat", () => {
    const withClass = computeCompleteness(completenessInputFromRow({ ...complete, energy_class: "B" }, media));
    expect(withClass.recommended.find((i) => i.key === "energy_class")?.done).toBe(true);
    expect(withClass.percent).toBe(100);
    const without = computeCompleteness(completenessInputFromRow({ ...complete, energy_class: null }, media));
    expect(without.recommended.find((i) => i.key === "energy_class")?.done).toBe(false);
    expect(without.percent).toBeLessThan(100);
  });

  it("normalizes a legacy value like „a+” to „A+” in the form", async () => {
    const { container, root, select } = await renderForm({ ...complete, energy_class: "a+" });
    try {
      expect(select.value).toBe("A+");
      // Fără opțiune duplicat: „A+” apare o singură dată.
      expect(Array.from(select.options).filter((o) => o.value === "A+")).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("keeps an unknown legacy value visible instead of losing it", async () => {
    const { container, root, select } = await renderForm({ ...complete, energy_class: "Clasa A (certificat 2019)" });
    try {
      expect(select.value).toBe("Clasa A (certificat 2019)");
      expect(Array.from(select.options).some((o) => o.value === "Clasa A (certificat 2019)")).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("normalizeEnergyClass maps equivalents and preserves unknowns", () => {
    expect(normalizeEnergyClass("a+")).toBe("A+");
    expect(normalizeEnergyClass(" a ")).toBe("A");
    expect(normalizeEnergyClass("A++")).toBe("A++");
    expect(normalizeEnergyClass("necunoscut")).toBe("necunoscut");
    expect(normalizeEnergyClass("")).toBeNull();
    expect(normalizeEnergyClass(null)).toBeNull();
    expect(ENERGY_CLASS_OPTIONS).toEqual(["A++", "A+", "A", "B", "C", "D", "E", "F", "G"]);
  });
});