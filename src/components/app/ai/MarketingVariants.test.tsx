// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ enabled: true, generate: vi.fn(), propose: vi.fn(), decide: vi.fn(), apply: vi.fn() }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isEnabled: () => m.enabled }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/ai/agents/marketing/marketing.functions", () => ({ generateMarketing: m.generate, proposeMarketingAction: m.propose, decideMarketingAction: m.decide }));
vi.mock("@/lib/ai/agents/marketing/portal-description.functions", () => ({ applyPortalDescription: m.apply }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn() } }));
import { MarketingVariants } from "./MarketingVariants";
const roots: ReturnType<typeof createRoot>[] = [];
const generated = { status: "ok", run: { id: "run", results: [{ validationStatus: "valid", content: { body: "2 camere", hashtags: ["#Apartament"] } }] } };
async function mount() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div"); document.body.appendChild(el); const root = createRoot(el); roots.push(root); const client = new QueryClient();
  const onDescription = vi.fn(); const onSocial = vi.fn();
  await act(async () => root.render(<QueryClientProvider client={client}><MarketingVariants propertyId="property" onDescription={onDescription} onSocial={onSocial} /></QueryClientProvider>));
  return { el, onDescription, onSocial };
}
async function click(el: HTMLElement, label: string) { const button = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(label)); if (!button) throw new Error("Control absent"); await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 20)); }); }
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.clearAllMocks(); m.enabled = true; });
describe("variante de marketing", () => {
  it("generarea nu salvează; Aplică schimbă numai formularul", async () => {
    m.generate.mockResolvedValue(generated); const { el, onDescription } = await mount(); await click(el, "Generează varianta");
    expect(onDescription).not.toHaveBeenCalled(); expect(m.propose).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled();
    await click(el, "Aplică în formular"); expect(onDescription).toHaveBeenCalledWith("2 camere"); expect(m.propose).not.toHaveBeenCalled();
  });
  it("descrierea pentru portal folosește ciorna aprobată, nu scrie anunțul", async () => {
    m.generate.mockResolvedValue(generated); m.propose.mockResolvedValue({ ok: true }); m.decide.mockResolvedValue({ ok: true, run: { results: [{ draftId: "draft" }] } }); m.apply.mockResolvedValue({ ok: true, message: "ok" });
    const { el, onDescription } = await mount(); await click(el, "Generează varianta"); await click(el, "Salvează descrierea");
    expect(m.decide).toHaveBeenCalledWith({ data: { runId: "run", approved: true } });
    expect(m.apply).toHaveBeenCalledWith({ data: { propertyId: "property", draftId: "draft", portal: "olx_direct" } }); expect(onDescription).not.toHaveBeenCalled();
  });
  it("postarea și hashtagurile intră doar în editor după Aplică", async () => {
    m.generate.mockResolvedValue(generated); const { el, onSocial } = await mount(); await click(el, "Facebook"); await click(el, "Generează varianta"); expect(onSocial).not.toHaveBeenCalled(); await click(el, "Aplică în postare"); expect(onSocial).toHaveBeenCalledWith("facebook", "2 camere\n\n#Apartament");
  });
  it("AI dezactivat nu afișează instrumentul", async () => { m.enabled = false; const { el } = await mount(); expect(el.childElementCount).toBe(0); expect(m.generate).not.toHaveBeenCalled(); });
  it("răspunsul invalid nu poate fi aplicat", async () => {
    m.generate.mockResolvedValue({ ...generated, run: { id: "run", results: [{ ...generated.run.results[0], validationStatus: "invalid" }] } });
    const { el, onDescription } = await mount(); await click(el, "Generează varianta"); expect(el.querySelector("[role=alert]")).not.toBeNull(); expect(onDescription).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled();
  });
});