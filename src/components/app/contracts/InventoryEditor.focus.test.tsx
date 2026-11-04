// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { InventoryEditor } from "./InventoryEditor";
import type { InventoryItem } from "@/lib/contracts/templates";

function Host() {
  const [items, setItems] = useState<InventoryItem[]>([{ name: "", quantity: 1, condition: "Buna", location: "", notes: "" }]);
  return <InventoryEditor items={items} onChange={setItems} />;
}

describe("InventoryEditor", () => {
  it("keeps focus on the name field while typing 5 letters", () => {
    render(<Host />);
    let input = screen.getAllByLabelText("Denumire")[0] as HTMLInputElement;
    input.focus();
    for (const ch of "Masaa") {
      fireEvent.change(document.activeElement!, { target: { value: (document.activeElement as HTMLInputElement).value + ch } });
      expect(document.activeElement).toBe(input);
    }
    input = screen.getAllByLabelText("Denumire")[0] as HTMLInputElement;
    expect(input.value).toBe("Masaa");
    expect(document.activeElement).toBe(input);
  });
});
