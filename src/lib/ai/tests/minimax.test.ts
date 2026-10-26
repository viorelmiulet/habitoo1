import { afterEach, describe, expect, it, vi } from "vitest";
import { createMiniMaxProvider, toMiniMaxMessages } from "../providers/minimax.server";
import { resolveAiProvider, aiProviderStatus } from "../providers/registry.server";
import { withAiProviderFallback } from "../providers/fallback.server";
import { AiProviderError, type AIProvider } from "../providers/types";
import { runCoordinator } from "../agent/coordinator.server";
import { AiTracer } from "../tracing/trace";
import { aiToolDeclarations } from "../tools/registry";
import { writeAiUsage } from "../usage/tracking.server";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organizationId: "11111111-1111-4111-8111-111111111111", role: "agent" as const };
const trace = () => new AiTracer("test", { organizationId: actor.organizationId, userId: actor.userId });
const reply = (content: unknown[], input = 12, output = 6) => Response.json({ content, usage: { input_tokens: input, output_tokens: output } });

describe("MiniMax protocol and complete-request fallback", () => {
  it("replays thinking/signature and all tool-use blocks unchanged with real IDs", async () => {
    const blocks = [
      { type: "thinking", thinking: "reasoning fixture", signature: "signed-fixture" },
      { type: "tool_use", id: "call-real-1", name: "search_properties", input: { query: "Cluj" } },
      { type: "tool_use", id: "call-real-2", name: "search_properties", input: { query: "București" } },
    ];
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1 ? reply(blocks) : reply([{ type: "text", text: "Gata" }], 30, 8);
    }));
    const execute = vi.fn(async () => ({ ok: true as const, data: [], sources: [], summary: "0 proprietăți", capability: "read:properties" }));
    const result = await runCoordinator({ actor, provider: createMiniMaxProvider("fixture"), system: "rules", messages: [{ role: "user", content: "Caută" }], declarations: aiToolDeclarations(), tracer: trace(), tools: { search_properties: { id: "search_properties", execute } } });
    const messages = bodies[1]?.["messages"] as { content: unknown[] }[];
    expect(messages[1]?.content).toEqual(blocks);
    expect(messages[2]?.content).toEqual([
      { type: "tool_result", tool_use_id: "call-real-1", content: '{"ok":true,"data":[]}' },
      { type: "tool_result", tool_use_id: "call-real-2", content: '{"ok":true,"data":[]}' },
    ]);
    expect(result.answer).toBe("Gata");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toMatchObject({ model: "MiniMax-M3.1-Flash", max_tokens: 8192, output_config: { effort: "low" }, tool_choice: { type: "auto" } });
    for (const key of ["temperature", "top_p", "cache_control", "service_tier", "thinking"]) expect(bodies[0]).not.toHaveProperty(key);
    expect((bodies[0]?.["tools"] as unknown[])[0]).toHaveProperty("input_schema");
  });

  it("sends attachments as base64 image blocks", () => {
    expect(toMiniMaxMessages([{ role: "user", content: "Poză", attachments: [{ mimeType: "image/jpeg", base64: "aW1hZ2U=" }] }])[0]?.content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "aW1hZ2U=" } });
  });

  it("restarts at the original user input on Gemini after three 529 failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive upstream", { status: 529 })));
    const gemini: AIProvider = { id: "gemini", model: "gemini-fixture", supportsTools: true, generate: vi.fn(async request => {
      expect(request.messages).toEqual([{ role: "user", content: "Salut" }]);
      return { text: "Salut!", toolCalls: [], inputTokens: 4, outputTokens: 2 };
    }) };
    const primary = { ...createMiniMaxProvider("fixture"), fallback: gemini };
    const completed = await withAiProviderFallback(primary, provider => runCoordinator({ actor, provider, system: "rules", messages: [{ role: "user", content: "Salut" }], declarations: [], tracer: trace(), tools: {}, throwProviderErrors: true }));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(gemini.generate).toHaveBeenCalledTimes(1);
    expect(completed.provider.id).toBe("gemini");
    expect(completed.fallbackUsed).toBe(true);
    const insert = vi.fn(async () => ({ error: null }));
    await writeAiUsage({ from: () => ({ insert }) }, { organization_id: "org", user_id: "user", provider: completed.provider.id, model: completed.provider.model, fallback_used: completed.fallbackUsed, capability: "chat", input_tokens: completed.result.inputTokens, output_tokens: completed.result.outputTokens, latency_ms: 1, success: true, tool_calls: 0 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini", model: "gemini-fixture", fallback_used: true, input_tokens: 4, output_tokens: 2 }));
  });

  it.each([400, 401, 403, 404])("never retries or falls back on terminal %i", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("raw", { status })));
    const fallback = { id: "gemini", model: "fixture", supportsTools: true, generate: vi.fn() };
    await expect(withAiProviderFallback({ ...createMiniMaxProvider("fixture"), fallback }, provider => provider.generate({ system: "rules", messages: [], tools: [] }))).rejects.toMatchObject({ status, retryable: false });
    expect(fallback.generate).not.toHaveBeenCalled();
  });

  it("uses Gemini when MiniMax is not configured", () => {
    vi.stubEnv("MINIMAX_API_KEY", ""); vi.stubEnv("GEMINI_API_KEY", "fixture");
    expect(resolveAiProvider()?.id).toBe("gemini");
    expect(aiProviderStatus().providers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "minimax", configured: false }), expect.objectContaining({ id: "gemini", configured: true })]));
  });
  it("returns not configured when neither key exists", () => {
    vi.stubEnv("MINIMAX_API_KEY", ""); vi.stubEnv("GEMINI_API_KEY", "");
    expect(resolveAiProvider()).toBeNull(); expect(aiProviderStatus().configured).toBe(false);
  });
  it("chooses MiniMax model and effort configuration", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "fixture"); vi.stubEnv("MINIMAX_MODEL", "chosen-fixture"); vi.stubEnv("MINIMAX_EFFORT", "medium");
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      expect(JSON.parse(init.body)).toMatchObject({ model: "chosen-fixture", output_config: { effort: "medium" }, max_tokens: 8192 });
      return reply([{ type: "text", text: "ok" }], 21, 11);
    }));
    const answer = await resolveAiProvider()?.generate({ system: "rules", messages: [{ role: "user", content: "Salut" }], tools: [], maxOutputTokens: 64 });
    expect(answer).toMatchObject({ inputTokens: 21, outputTokens: 11 });
  });
  it("does not restart non-provider failures", async () => {
    const fallback = { id: "gemini", model: "fixture", supportsTools: true, generate: vi.fn() };
    await expect(withAiProviderFallback({ ...createMiniMaxProvider("fixture"), fallback }, async () => { throw new Error("database timeout"); })).rejects.toThrow("database timeout");
    expect(fallback.generate).not.toHaveBeenCalled();
  });
  it("never falls back on a refusal with empty content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ stop_reason: "refusal", content: [] })));
    await expect(createMiniMaxProvider("fixture").generate({ system: "rules", messages: [], tools: [] })).rejects.toBeInstanceOf(AiProviderError);
  });
});