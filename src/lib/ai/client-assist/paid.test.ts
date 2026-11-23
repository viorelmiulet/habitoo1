import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ enabled: true, reserve: vi.fn(), usage: vi.fn(), provider: vi.fn() }));
vi.mock("../features/features.server", () => ({ AI_DISABLED_MESSAGE: "AI dezactivat", isAiFeatureEnabled: async () => m.enabled }));
vi.mock("../providers/registry.server", () => ({ resolveAiProvider: m.provider }));
vi.mock("../credits/credits.server", () => ({ withAiCredits: m.reserve }));
vi.mock("../usage/tracking.server", () => ({ writeAiUsage: m.usage }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { paidClientAnalysis } from "./paid.server";
beforeEach(() => { m.enabled = true; m.reserve.mockReset().mockImplementation(async (_actor: unknown, _action: unknown, run: () => Promise<unknown>) => run()); m.provider.mockReset().mockReturnValue({ id: "gemini", model: "test-only" }); m.usage.mockReset(); });
describe("client AI activation and credits", () => {
  it("AI dezactivat: nici model, nici credite, nici generare", async () => {
    m.enabled = false; const run = vi.fn();
    await expect(paidClientAnalysis("org-a", "agent-a", "client_summary", run)).rejects.toThrow("AI dezactivat");
    expect(m.provider).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });
  it("consumul este înregistrat pe agenția și utilizatorul apelantului", async () => {
    const result = await paidClientAnalysis("org-a", "agent-a", "dictated_call", async () => ({ value: "propunere", usage: { inputTokens: 12, outputTokens: 8 } }));
    expect(result).toBe("propunere"); expect(m.reserve.mock.calls[0]?.slice(0, 2)).toEqual([{ organizationId: "org-a", userId: "agent-a" }, "text_standard"]);
    expect(m.usage.mock.calls[0]?.[1]).toMatchObject({ organization_id: "org-a", user_id: "agent-a", capability: "dictated_call", success: true, provider: "gemini", input_tokens: 12, output_tokens: 8 });
  });
  it("răspunsul invalid nu este taxat ca succes și nu persistă conținutul", async () => {
    await paidClientAnalysis("org-a", "agent-a", "client_summary", async () => ({ value: null, usage: { inputTokens: 12, outputTokens: 8 } }));
    const options = m.reserve.mock.calls[0]?.[3] as { isSuccess: (value: unknown) => boolean };
    expect(options.isSuccess(null)).toBe(false); expect(options.isSuccess("valid")).toBe(true);
    expect(m.usage.mock.calls[0]?.[1]).toMatchObject({ success: false }); expect(m.usage.mock.calls[0]?.[1]).not.toHaveProperty("transcript");
  });
});