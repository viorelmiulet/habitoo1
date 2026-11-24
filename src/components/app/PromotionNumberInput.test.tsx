// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PromotionNumberInput } from "./PromotionNumberInput";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

function setup(max?: number) {
  const onValue = vi.fn();
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(<PromotionNumberInput value={0} {...(max !== undefined ? { max } : {})} onValue={onValue} aria-label="Energy" />));
  return { input: el.querySelector("input") as HTMLInputElement, onValue };
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("PromotionNumberInput", () => {
  it("clearing 0 leaves the field empty and sends 0", () => {
    const { input, onValue } = setup();
    act(() => input.focus());
    type(input, "");
    expect(input.value).toBe("");
    expect(onValue).toHaveBeenLastCalledWith(0);
    act(() => input.blur());
    expect(input.value).toBe("0");
  });
  it("typing 340 over 0 sends 340 and shows 340", () => {
    const { input, onValue } = setup();
    type(input, "0340");
    expect(input.value).toBe("340");
    expect(onValue).toHaveBeenLastCalledWith(340);
  });
  it("caps the value at max", () => {
    const { input, onValue } = setup(100);
    type(input, "340");
    expect(input.value).toBe("100");
    expect(onValue).toHaveBeenLastCalledWith(100);
  });
});
