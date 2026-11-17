// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { FormRow } from "./FormSection";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FormRow compact (fișa proprietății)", () => {
  it("pune eticheta deasupra, la stânga, fără coloană fixă îngustă", () => {
    const c = document.createElement("div");
    act(() => createRoot(c).render(<FormRow compact htmlFor="x" label="Camere"><input id="x" /></FormRow>));
    const row = c.firstElementChild as HTMLElement;
    expect(row.dataset.formRow).toBe("stacked");
    expect(row.className).toContain("flex-col");
    expect(row.className).not.toMatch(/grid-cols-\[140px/);
    const label = row.querySelector("label")!;
    expect(label.className).toContain("text-left");
    expect(label.className).not.toContain("sm:text-right");
    expect(label.className).toContain("whitespace-nowrap");
    expect(row.children[0].tagName).toBe("LABEL");
  });
});
