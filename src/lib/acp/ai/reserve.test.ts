import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAiProvider } from "@/lib/ai/providers/registry.server";
import { runGenerateAcpAiAnalysis } from "../ai.functions";

const fx = vi.hoisted(() => ({ inserts: [] as { table: string; row: Record<string, unknown> }[] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn };
  return chain;
} }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/lib/ai/features/features.server", () => ({ isAiFeatureEnabled: async () => true }));
vi.mock("../audit", () => ({ ACP_AUDIT_ACTIONS: { aiGenerated: "ai_generated" }, logAcpAudit: async () => undefined }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async () => ({ data: true, error: null }),
  from: (table: string) => {
    const q = {
      select: () => q, eq: () => q, order: () => q,
      maybeSingle: async () => ({ data: table === "profiles" ? { organization_id: "org" } : {
        id: "analysis", organization_id: "org", version: 2, snapshot_at: "2026-10-01T00:00:00Z",
        target_data: { title: "Test", subject: { usableArea: 50 } },
        analysis_data: { estimate: { estimatedValue: 100000 }, statistics: { median: 100000 }, confidence: { score: 60 } },
      }, error: null }),
      insert: (row: Record<string, unknown>) => { fx.inserts.push({ table, row }); return q; },
      update: () => q,
      single: async () => ({ data: { id: "insight" }, error: null }),
      then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
    };
    return q;
  },
} }));
const insight = {
  executive_summary: "R", valuation_explanation: "E", market_context: "C", comparable_analysis: "A",
  key_drivers: ["S"], risks_and_limitations: ["E"], recommended_positioning: "P",
  confidence_explanation: "I", client_friendly_summary: "R",
};
const run = runGenerateAcpAiAnalysis as unknown as (a: unknown) => Promise<{ status: string; model?: string; message?: string }>;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fx.inserts.length = 0; });

function stub(primaryStatus: number) {
  const f = vi.fn(async (url: string) => {
    if (url.includes("flash-lite")) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(insight) }] } }] });
    if (url.includes("generativelanguage")) return new Response("busy", { status: primaryStatus });
    throw new Error("unexpected " + url);
  });
  vi.stubGlobal("fetch", f);
  return f;
}

describe("Gemini reserve when Mistral is missing", () => {
  it("503 → ACP uses gemini-3.5-flash-lite and saves the insight", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x"); vi.stubEnv("MISTRAL_API_KEY", "");
    stub(503);
    const result = await run({ context: { userId: "u" }, data: { analysisId: "analysis" } });
    expect(result.status).toBe("ok");
    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(fx.inserts.find((e) => e.table === "acp_ai_insights")?.row).toMatchObject({ status: "ok", model: "gemini-3.5-flash-lite", fallback_used: true });
    expect(fx.inserts.find((e) => e.table === "ai_usage_events")?.row).toMatchObject({ model: "gemini-3.5-flash-lite", fallback_used: true });
  }, 15000);

  it("400 does not switch to the reserve", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x"); vi.stubEnv("MISTRAL_API_KEY", "");
    const f = stub(400);
    const result = await run({ context: { userId: "u" }, data: { analysisId: "analysis" } });
    expect(result.status).toBe("failed");
    expect(f.mock.calls.some(([u]) => String(u).includes("flash-lite"))).toBe(false);
  }, 15000);

  it("with Mistral configured the reserve stays Mistral", () => {
    vi.stubEnv("GEMINI_API_KEY", "x"); vi.stubEnv("MISTRAL_API_KEY", "m");
    expect(resolveAiProvider("standard")?.fallback?.id).toBe("mistral");
    vi.stubEnv("MISTRAL_API_KEY", "");
    expect(resolveAiProvider("standard")?.fallback?.model).toBe("gemini-3.5-flash-lite");
  });
});
