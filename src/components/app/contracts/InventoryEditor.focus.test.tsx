// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { InventoryEditor } from "./InventoryEditor";
import type { InventoryItem } from "@/lib/contracts/templates";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Host() {
  const [items, setItems] = useState<InventoryItem[]>([{ name: "", quantity: 1, condition: "Buna", location: "", notes: "" }]);
  return <InventoryEditor items={items} onChange={setItems} />;
}

describe("InventoryEditor", () => {
  it("keeps focus on the name field while typing 5 letters", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => createRoot(host).render(<Host />));
    const input = host.querySelector('input[aria-label="Denumire"]') as HTMLInputElement;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const ch of "Masaa") {
      const el = document.activeElement as HTMLInputElement;
      act(() => {
        setter.call(el, el.value + ch);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe("Masaa");
  });
});
