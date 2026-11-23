// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: true, insight: null as Record<string, unknown> | null, analyze: vi.fn(), apply: vi.fn(), select: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isLoading: false, isEnabled: () => mocks.enabled }) }));
vi.mock("@/lib/ai/lead-assist/lead-assist.functions", () => ({ analyzeLeadConversation: mocks.analyze, applyLeadRequestChanges: mocks.apply }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const query = { select: () => { mocks.select(); return query; }, eq: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data: mocks.insight, error: null }) };
  return query;
} } }));
import { LeadAiAssist } from "./LeadAiAssist";
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
const draft = "Prețul afișat este 79.000 EUR. Doriți o vizionare?";
const insight = { id: "i1", draft, updated_at: "2026-11-23", score: 95, score_reason: "Buget și vizionare", request_id: null, changes_applied_at: null,
  proposed_changes: [{ field: "kind", value: "buy", text: "Cumpărare", evidence: "Vreau să cumpăr." }, { field: "budget_max", value: 80000, text: "Buget 80.000 EUR", evidence: "Buget 80.000 EUR." }, { field: "currency", value: "EUR", text: "Moneda EUR", evidence: "Buget 80.000 EUR." }] };
async function render(onUse = vi.fn()) {
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root?.render(<QueryClientProvider client={client}><LeadAiAssist leadId="lead-a" phone={null} hasNote portalReply onUse={onUse} /></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  return host;
}
async function click(button: HTMLElement | undefined) {
  if (!button) throw new Error("Control missing");
  await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 40)); });
}
const named = (host: HTMLElement, name: string) => [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === name);
beforeEach(() => { mocks.enabled = true; mocks.insight = insight; mocks.analyze.mockReset().mockResolvedValue({ ok: true }); mocks.apply.mockReset().mockResolvedValue({ ok: true }); mocks.select.mockClear(); });
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
describe("confirmarea agentului în panoul existent", () => {
  it("AI dezactivat: funcțiile nu apar și nu se citesc propuneri", async () => {
    mocks.enabled = false;
    const host = await render(); expect(host.childElementCount).toBe(0); expect(mocks.select).not.toHaveBeenCalled();
  });
  it("ciorna nu trimite și nu salvează; Folosește doar o pune în formularul existent", async () => {
    const onUse = vi.fn(); const host = await render(onUse);
    expect(host.querySelector("textarea")?.value).toBe(draft);
    expect(onUse).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
    await click(named(host, "Folosește")); expect(onUse).toHaveBeenCalledExactlyOnceWith(draft);
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("valorile cu fragmente se salvează numai după selectare și confirmare explicită", async () => {
    const host = await render();
    expect(mocks.apply).not.toHaveBeenCalled();
    const save = named(host, "Confirmă și salvează cererea"); expect(save?.disabled).toBe(true);
    for (const checkbox of host.querySelectorAll<HTMLElement>('[role="checkbox"]')) await click(checkbox);
    expect(save?.disabled).toBe(false);
    await click(save);
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ data: { insightId: "i1", fields: ["kind", "budget_max", "currency"] } });
  });
  it("lead fără analiză are butonul manual și nu generează nimic la deschidere", async () => {
    mocks.insight = null; const host = await render();
    expect(mocks.analyze).not.toHaveBeenCalled();
    await click(named(host, "Răspunde cu AI"));
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith({ data: { leadId: "lead-a", source: "lead" } });
  });
});