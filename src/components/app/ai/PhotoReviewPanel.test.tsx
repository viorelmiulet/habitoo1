// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: true, run: vi.fn() }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isEnabled: () => mocks.enabled }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.run }));
vi.mock("@/lib/ai/listing-autofill/photo-review.functions", () => ({ reviewListingPhotos: {} }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn() } }));
import { PhotoReviewPanel } from "./PhotoReviewPanel";
const roots: ReturnType<typeof createRoot>[] = [];
async function mount() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div"); document.body.appendChild(el); const root = createRoot(el); roots.push(root);
  const onOrder = vi.fn(async () => undefined); const onExclude = vi.fn(async () => undefined);
  await act(async () => root.render(<PhotoReviewPanel propertyId="p" photos={[{ id: "bath", url: null }, { id: "living", url: null }]} onOrder={onOrder} onExclude={onExclude} />));
  return { el, onOrder, onExclude };
}
async function click(el: HTMLElement, label: string) { const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(label)); if (!button) throw new Error("Control absent"); await act(async () => button.click()); }
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.clearAllMocks(); mocks.enabled = true; });
describe("galerie AI cu confirmare", () => {
  it("generarea nu ordonează sau exclude; fiecare modificare cere confirmare", async () => {
    mocks.run.mockResolvedValue({ ok: true, review: { order: ["living", "bath"], photos: [{ id: "bath", category: "bathroom", reasons: ["Fotografie întunecată"] }, { id: "living", category: "living", reasons: [] }] } });
    const { el, onOrder, onExclude } = await mount(); await click(el, "Analizează");
    expect(onOrder).not.toHaveBeenCalled(); expect(onExclude).not.toHaveBeenCalled();
    await click(el, "Aplică ordinea"); expect(onOrder).toHaveBeenCalledWith(["living", "bath"]); expect(onExclude).not.toHaveBeenCalled();
    await click(el, "Exclude"); expect(onExclude).toHaveBeenCalledWith("bath");
  });
  it("AI dezactivat nu oferă operații și nu pornește analiza", async () => {
    mocks.enabled = false; const { el } = await mount(); expect(el.childElementCount).toBe(0); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("răspunsul invalid nu modifică nimic", async () => {
    mocks.run.mockResolvedValue({ ok: false, message: "invalid" }); const { el, onOrder, onExclude } = await mount(); await click(el, "Analizează");
    expect(onOrder).not.toHaveBeenCalled(); expect(onExclude).not.toHaveBeenCalled(); expect(el.querySelector("[role=alert]")).not.toBeNull();
  });
});