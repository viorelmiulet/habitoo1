// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PropertyDetailsFields } from "./PropertyDetailsFields";

vi.mock("@/components/app/PropertyFeatureSections", () => ({ PropertyFeatureSections: () => null }));
vi.mock("@/components/app/ai/AiFieldMarks", () => ({ AiMark: () => null }));
// Native select exercises the form's real conditional visibility and onChange contract.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
    <select value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: ({ id }: { id: string }) => <option data-field-id={id} value="__placeholder__" disabled />,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.replaceChildren(); });

function setup(property_type: string, category: string | null = null) {
  const host = document.createElement("div");
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  const onChange = vi.fn();
  act(() => mounted.render(<PropertyDetailsFields idPrefix="edit" value={{ property_type, category }} onChange={onChange} />));
  const select = host.querySelector('[data-field-id="edit-category"]')?.closest("select");
  return { select, onChange };
}
describe("Tip casă în formular", () => {
  it.each(["house", "villa"])("%s permite salvarea și ștergerea subtipului", type => {
    const { select, onChange } = setup(type);
    expect(select).toBeInstanceOf(HTMLSelectElement);
    if (!(select instanceof HTMLSelectElement)) throw new Error("Câmpul lipsește");
    act(() => { select.value = "Individuală"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ category: "Individuală" });
    act(() => { select.value = "__none__"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ category: null });
  });
  it.each(["apartment", "studio", "land", "office", "commercial", "industrial", "duplex", "penthouse", "other"])("%s nu afișează câmpul și nu rescrie category", type => {
    const { select, onChange } = setup(type, "Categorie existentă");
    expect(select).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("editarea încarcă valoarea category deja salvată", () => {
    expect(setup("house", "Conac").select?.value).toBe("Conac");
  });
});