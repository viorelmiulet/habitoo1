// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ enabled: true, summarize: vi.fn(), analyze: vi.fn(), requests: vi.fn(), confirm: vi.fn(), insert: vi.fn(), record: vi.fn(), cancel: vi.fn(), stop: vi.fn() }));
vi.mock("@tanstack/react-start", async importOriginal => ({ ...await importOriginal<typeof import("@tanstack/react-start")>(), useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ isLoading: false, isEnabled: () => m.enabled }) }));
vi.mock("@/hooks/use-session", () => ({ useCurrentUser: () => ({ data: { userId: "agent-a", organization: { id: "org-a" } } }) }));
vi.mock("@/lib/ai/client-assist/client-assist.functions", () => ({ summarizeContact: m.summarize, analyzeDictatedCall: m.analyze, loadCallRequests: m.requests, confirmCallRequest: m.confirm }));
vi.mock("@/lib/ai/client-assist/recording", () => ({ recordCall: m.record, withEphemeralAudio: async (_blob: unknown, send: (a: unknown) => unknown) => send({ base64: "test-only", mimeType: "audio/wav" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "agent-a", full_name: "Agent" }], error: null }) }) }), insert: m.insert }) } }));
import { ClientAiPanel } from "./ClientAiPanel";
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
const value = { organizationId: "org-a", transcript: "Vreau să cumpăr 3 camere. Revin pe 25.11.2026.", activity: "Vreau să cumpăr 3 camere.", followup: { excerpt: "Revin pe 25.11.2026.", date: "2026-11-25" }, changes: [{ field: "kind", value: "buy", text: "Cumpărare", evidence: "Vreau să cumpăr 3 camere." }] };
async function render() {
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root?.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClientAiPanel entity={{ kind: "contact", id: "c1" }} /></QueryClientProvider>); }); return host;
}
const named = (name: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === name);
async function click(name: string) { const button = named(name); if (!button) throw new Error(`Missing ${name}`); await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 40)); }); }
async function dictate() { await click("Dictează notița de apel"); await click("Oprește și transcrie"); }
beforeEach(() => { m.enabled = true; m.summarize.mockReset().mockResolvedValue({ ok: true, value: "Caută 3 camere." }); m.analyze.mockReset().mockResolvedValue({ ok: true, value }); m.requests.mockReset().mockResolvedValue([]); m.confirm.mockReset().mockResolvedValue({ ok: true, value: "r1" }); m.insert.mockReset().mockResolvedValue({ error: null }); m.cancel.mockReset().mockResolvedValue(undefined); m.stop.mockReset().mockResolvedValue({}); m.record.mockReset().mockResolvedValue({ stop: m.stop, cancel: m.cancel }); });
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
describe("client proposals require explicit confirmation", () => {
  it("AI dezactivat: nu apar funcțiile și nu se citesc/generază propuneri", async () => {
    m.enabled = false; const host = await render(); expect(host.childElementCount).toBe(0); expect(m.requests).not.toHaveBeenCalled(); expect(m.summarize).not.toHaveBeenCalled(); expect(m.analyze).not.toHaveBeenCalled();
  });
  it("rezumatul se generează doar la cerere și nu salvează contactul", async () => {
    await render(); expect(m.summarize).not.toHaveBeenCalled(); await click("Rezumatul clientului");
    expect(m.summarize).toHaveBeenCalledExactlyOnceWith({ data: { id: "c1" } }); expect(m.insert).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled();
  });
  it("notița propune activitate, follow-up și cerere fără să salveze automat", async () => {
    await render(); await dictate(); expect(m.analyze).toHaveBeenCalledTimes(1); expect(m.insert).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled();
    await click("Revizuiește activitatea"); expect(m.insert).not.toHaveBeenCalled();
    await click("Salvează activitatea"); expect(m.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "call", contact_id: "c1", organization_id: "org-a", title: value.activity, done: true, status: "done" })); expect(m.confirm).not.toHaveBeenCalled();
  });
  it("follow-up se salvează separat numai prin formularul existent", async () => {
    await render(); await dictate(); await click("Revizuiește follow-up"); expect(m.insert).not.toHaveBeenCalled(); await click("Salvează activitatea");
    expect(m.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "followup", status: "planned", title: "Revin pe 25.11.2026." }));
  });
  it("cererea cere selectare și confirmare explicită, independent de activități", async () => {
    const host = await render(); await dictate(); expect(named("Confirmă și salvează cererea")?.disabled).toBe(true);
    const checkbox = host.querySelector<HTMLElement>('[role="checkbox"]'); if (!checkbox) throw new Error("Missing checkbox");
    await act(async () => { checkbox.click(); }); await click("Confirmă și salvează cererea");
    expect(m.confirm).toHaveBeenCalledExactlyOnceWith({ data: { entity: { kind: "contact", id: "c1" }, requestId: null, source: value.transcript, request: { kind: "buy" }, fields: ["kind"] } }); expect(m.insert).not.toHaveBeenCalled();
  });
  it("închiderea fișei oprește microfonul și elimină înregistrarea fără transcriere", async () => {
    await render(); await click("Dictează notița de apel"); await act(async () => { root?.unmount(); root = null; });
    expect(m.cancel).toHaveBeenCalledOnce(); expect(m.analyze).not.toHaveBeenCalled();
  });
  it("la limita de două minute înregistrarea se oprește și se transcrie o singură dată", async () => {
    vi.useFakeTimers();
    try {
      await render(); const button = named("Dictează notița de apel"); if (!button) throw new Error("Missing recorder");
      await act(async () => { button.click(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
      expect(m.stop).toHaveBeenCalledOnce(); expect(m.analyze).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("un răspuns invalid nu salvează nimic și permite o nouă încercare", async () => {
    m.analyze.mockResolvedValue({ ok: false, message: "Răspuns invalid" }); await render(); await dictate();
    expect(m.insert).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled(); expect(named("Dictează notița de apel")?.disabled).toBe(false);
  });
});