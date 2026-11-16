import { describe, expect, it, vi } from "vitest";
import { AI_MODEL_DEFAULTS } from "../providers/models";
import { GEMINI_DEFAULT_MODEL, geminiThinkingConfig } from "../providers/gemini.server";
import { withAiProviderFallback } from "../providers/fallback.server";
import { AiProviderError, type AIProvider } from "../providers/types";
import { withAiCredits } from "../credits/credits.server";

const provider = (id: string, generate: () => Promise<unknown>, fallback?: AIProvider): AIProvider =>
  ({ id, model: `${id}-m`, supportsTools: true, generate, ...(fallback ? { fallback } : {}) }) as unknown as AIProvider;

describe("AI10", () => {
  it("valorile implicite nu mai conțin gemini-2.", () => {
    expect(AI_MODEL_DEFAULTS.fast).toBe("gemini-3.5-flash-lite");
    expect(AI_MODEL_DEFAULTS.standard).toBe("gemini-3.5-flash");
    expect(Object.values(AI_MODEL_DEFAULTS).join(" ")).not.toContain("gemini-2.");
    expect(GEMINI_DEFAULT_MODEL).not.toContain("gemini-2.");
    expect(geminiThinkingConfig("gemini-3.5-flash-lite")).not.toHaveProperty("thinkingBudget");
  });

  it("404 model indisponibil → rezerva Mistral", async () => {
    const mistral = provider("mistral", async () => "ok");
    const gemini = provider("gemini", async () => { throw new AiProviderError("Providerul AI a răspuns cu 404.", 404, false); }, mistral);
    const out = await withAiProviderFallback(gemini, (p) => p.generate({} as never));
    expect(out.fallbackUsed).toBe(true);
    expect(out.provider.id).toBe("mistral");
  });

  it("400 nu trece pe rezervă", async () => {
    const mistral = provider("mistral", async () => "ok");
    const gemini = provider("gemini", async () => { throw new AiProviderError("x", 400, false); }, mistral);
    await expect(withAiProviderFallback(gemini, (p) => p.generate({} as never))).rejects.toThrow("x");
  });

  it("eroarea din withAiCredits scrie usage success:false și face refund", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "ai_credit_reserve" ? "res-1" : null, error: null }));
    const insert = vi.fn(async () => ({ error: null }));
    const usageClient = { from: vi.fn(() => ({ insert })) };
    await expect(
      withAiCredits({ organizationId: "org", userId: "u" }, "text_fast" as never,
        async () => { throw new AiProviderError("Providerul AI a răspuns cu 404.", 404); },
        { client: { rpc }, usageClient, usage: { provider: "gemini", model: "gemini-3.5-flash-lite" } }),
    ).rejects.toThrow("404");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      success: false, provider: "gemini", model: "gemini-3.5-flash-lite", capability: "text_fast",
      extra_info: expect.objectContaining({ http_status: 404 }),
    }));
    expect(rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "res-1", p_success: false });
  });

  it("scrierea usage care aruncă nu blochează refundul", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "ai_credit_reserve" ? "res-2" : null, error: null }));
    const usageClient = { from: () => { throw new Error("db down"); } };
    await expect(withAiCredits({ organizationId: "o", userId: "u" }, "text_fast" as never,
      async () => { throw new Error("boom"); }, { client: { rpc }, usageClient: usageClient as never })).rejects.toThrow("boom");
    expect(rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "res-2", p_success: false });
  });
});
