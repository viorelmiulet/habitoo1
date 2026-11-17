// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ enabled: true, run: vi.fn() }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isLoading: false, isEnabled: () => state.enabled }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => state.run }));
vi.mock("@/lib/ai/text-correction/correction.functions", () => ({ correctListingText: vi.fn() }));
import { TextCorrectionControl } from "./TextCorrectionControl";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); state.enabled = true; state.run.mockReset(); });
async function render(value = "APARTAMENT 2 CAMERE") {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const apply = vi.fn();
  await act(async () => root.render(<QueryClientProvider client={new QueryClient()}><TextCorrectionControl field="title" value={value} onApply={apply} /></QueryClientProvider>));
  cleanups.push(() => { act(() => root.unmount()); el.remove(); });
  const click = async (label: string) => { const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); };
  return { el, apply, click };
}
describe("text correction approval", () => {
  it("does not change the field until Apply", async () => {
    state.run.mockResolvedValue({ ok: true, text: "Apartament 2 camere", basic: false });
    const { el, apply, click } = await render();
    await click("Corectează textul");
    expect(state.run).toHaveBeenCalledWith({ data: { field: "title", text: "APARTAMENT 2 CAMERE" } });
    expect(apply).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Original");
    expect(el.textContent).toContain("Corectat");
    await click("Aplică");
    expect(apply).toHaveBeenCalledWith("Apartament 2 camere");
  });
  it("cancel leaves the original unchanged", async () => {
    state.run.mockResolvedValue({ ok: true, text: "Apartament 2 camere", basic: false });
    const { el, apply, click } = await render();
    await click("Corectează textul"); await click("Renunță");
    expect(apply).not.toHaveBeenCalled();
    expect(el.querySelector('[aria-label="Corectare titlu"]')).toBeNull();
  });
  it("empty and disabled fields cannot initiate correction", async () => {
    expect((await render("")).el.querySelector("button")).toBeNull();
    state.enabled = false;
    expect((await render()).el.querySelector("button")).toBeNull();
  });
});