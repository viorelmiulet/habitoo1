import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAcpAiAnalysis, ACP_AI_RATE_LIMITS } from "../ai.functions";
import { resolveAcpAiProvider } from "./provider.server";
import { buildAcpAiContext } from "./context";

const fixtures = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as Record<string, unknown>[],
  rpc: vi.fn(async () => ({ data: true, error: null })),
  enabled: vi.fn(async () => true),
  analysisData: { estimate: { estimatedValue: 100000 }, statistics: { median: 100000 }, confidence: { score: 60 }, untouched: "keep" },
}));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn };
  return chain;
} }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/lib/ai/features/features.server", () => ({ isAiFeatureEnabled: fixtures.enabled }));
vi.mock("../audit", () => ({ ACP_AUDIT_ACTIONS: { aiGenerated: "ai_generated" }, logAcpAudit: async () => undefined }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: fixtures.rpc,
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: table === "profiles" ? { organization_id: "org" } : {
        id: "analysis", organization_id: "org", version: 2, snapshot_at: "2026-10-01T00:00:00Z",
        target_data: { title: "Test", subject: { usableArea: 50 } }, analysis_data: fixtures.analysisData,
      }, error: null }),
      insert: (row: Record<string, unknown>) => { fixtures.inserts.push({ table, row }); return query; },
      update: (row: Record<string, unknown>) => { fixtures.updates.push(row); return query; },
      single: async () => ({ data: { id: "insight" }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  },
} }));
const insight = {
  executive_summary: "Rezumat", valuation_explanation: "Explicație", market_context: "Context",
  comparable_analysis: "Comparabile", key_drivers: ["Suprafața"], risks_and_limitations: ["Eșantion"],
  recommended_positioning: "Poziționare", confidence_explanation: "Încredere", client_friendly_summary: "Rezumat client",
};
const run = generateAcpAiAnalysis as unknown as (args: { context: { userId: string }; data: { analysisId: string } }) => Promise<{ status: string; model?: string; message?: string }>;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); fixtures.inserts.length = 0; fixtures.updates.length = 0; });

describe("ACP AI shared registry and validated persistence", () => {
  it.each(["valid", "corrected", "invalid", "fallback"])("%s JSON and actual usage", async (scenario) => {
    vi.stubEnv("MINIMAX_API_KEY", "fixture"); vi.stubEnv("GEMINI_API_KEY", "fixture");
    vi.stubEnv("MINIMAX_MODEL", "MiniMax-M3.1-Flash"); vi.stubEnv("GEMINI_MODEL", "gemini-fixture");
    let count = 0;
    const bodies: Record<string, unknown>[] = [];
    const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); bodies.push(body); count += 1;
      if (url.includes("minimax.io") && scenario === "fallback") return new Response("fixture", { status: 529 });
      const text = scenario === "invalid" || (scenario === "corrected" && count === 1) ? "not JSON" : JSON.stringify(insight);
      return url.includes("minimax.io")
        ? Response.json({ content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 20 } })
        : Response.json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 10 } });
    });
    vi.stubGlobal("fetch", mockFetch);
    const result = await run({ context: { userId: "user" }, data: { analysisId: "analysis" } });
    expect(result.status).toBe(scenario === "invalid" ? "failed" : "ok");
    expect(mockFetch).toHaveBeenCalledTimes(scenario === "fallback" ? 4 : scenario === "valid" ? 1 : 2);
    const usage = fixtures.inserts.filter((entry) => entry.table === "ai_usage_events");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.row).toMatchObject({ capability: "acp_ai", provider: scenario === "fallback" ? "gemini" : "minimax",
      model: scenario === "fallback" ? "gemini-fixture" : "MiniMax-M3.1-Flash", fallback_used: scenario === "fallback",
      input_tokens: scenario === "fallback" ? 80 : scenario === "valid" ? 100 : 200,
      output_tokens: scenario === "fallback" ? 10 : scenario === "valid" ? 20 : 40, success: scenario !== "invalid" });
    expect(fixtures.rpc).toHaveBeenNthCalledWith(1, "rate_limit_hit", { _bucket: "acp_ai:user:user", _limit: 10, _window_seconds: 3600 });
    expect(fixtures.rpc).toHaveBeenNthCalledWith(2, "rate_limit_hit", { _bucket: "acp_ai:org:org", _limit: 40, _window_seconds: 3600 });
    if (scenario === "invalid") {
      expect(fixtures.updates).toHaveLength(0);
      expect(result.message).toBe("Răspunsul AI nu a respectat formatul așteptat, așa că nu a fost salvat.");
    } else {
      expect(fixtures.updates[0]).toMatchObject({ ai_model: result.model, analysis_data: fixtures.analysisData });
      expect(fixtures.inserts.find((entry) => entry.table === "acp_ai_insights")?.row).toMatchObject({ model: result.model, status: "ok", insight });
    }
    if (scenario === "corrected") {
      const first = bodies[0]?.messages as { content: string }[];
      const second = bodies[1]?.messages as { content: string }[];
      expect(second[0]?.content).toContain(first[0]?.content);
      expect(second[0]?.content).toContain("Răspunsul anterior");
    }
  });

  it("unconfigured registry never uses the former gateway", () => {
    vi.stubEnv("MINIMAX_API_KEY", ""); vi.stubEnv("GEMINI_API_KEY", ""); vi.stubEnv("LOVABLE_API_KEY", "fixture");
    expect(resolveAcpAiProvider()).toBeNull();
    expect(ACP_AI_RATE_LIMITS.perUser.limit).toBe(10); expect(ACP_AI_RATE_LIMITS.perOrganization.limit).toBe(40);
  });

  it("disabled acp_ai never calls provider or writes usage", async () => {
    fixtures.enabled.mockResolvedValueOnce(false);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await run({ context: { userId: "user" }, data: { analysisId: "analysis" } })).toMatchObject({ status: "failed" });
    expect(fetch).not.toHaveBeenCalled(); expect(fixtures.inserts).toHaveLength(0);
  });
});