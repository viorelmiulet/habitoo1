import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { createGeminiProvider } from "@/lib/ai/providers/gemini.server";
import { AiProviderError, type AIProvider, type AiGenerateRequest } from "@/lib/ai/providers/types";
import { executeListingAutofill } from "@/lib/ai/listing-autofill/charge.server";

const img = { mimeType: "image/jpeg", base64: "AAAA" };
const actor = { organizationId: "org", userId: "u" };
const credits = { rpc: async (name: string) => ({ data: name === "ai_credit_reserve" ? "r1" : null, error: null }) };
function usageSink() {
  const rows: Record<string, unknown>[] = [];
  return { rows, client: { from: () => ({ insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; } }) } };
}
const okBody = { candidates: [{ content: { parts: [{ text: '{"fields":[]}' }] } }] };

afterEach(() => vi.unstubAllGlobals());

describe("AI11 listing_autofill", () => {
  it("503 → o reîncercare pe același model, apoi rezerva", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const fallbackCalls: AiGenerateRequest[] = [];
    const fallback: AIProvider = {
      id: "mistral", model: "mistral-small-latest", supportsTools: true,
      generate: async (r) => { fallbackCalls.push(r); return { text: '{"fields":[]}', toolCalls: [], inputTokens: 1, outputTokens: 1 }; },
    };
    const primary = { ...createGeminiProvider("k", "gemini-3.5-flash", { retryDelayMs: 1 }), fallback };
    const sink = usageSink();
    const result = await executeListingAutofill(actor, primary, { images: [img], audio: null, text: "" }, { client: credits, usageClient: sink.client });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).toContain("gemini-3.5-flash:generateContent");
    expect(fallbackCalls).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(sink.rows[0]).toMatchObject({ provider: "mistral", model: "mistral-small-latest", success: true, fallback_used: true });
  });

  it("503 urmat de succes → fără rezervă", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = createGeminiProvider("k", "gemini-3.5-flash", { retryDelayMs: 1 });
    const r = await p.generate({ system: "s", messages: [{ role: "user", content: "x" }], tools: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.text).toContain("fields");
  });

  it("rezerva fără suport de imagini primește doar text", async () => {
    const calls: AiGenerateRequest[] = [];
    const fallback: AIProvider = {
      id: "mistral", model: "mistral-tiny", supportsTools: true, supportsImages: false,
      generate: async (r) => { calls.push(r); return { text: '{"fields":[]}', toolCalls: [], inputTokens: 1, outputTokens: 1 }; },
    };
    const primary: AIProvider = { id: "gemini", model: "gemini-3.5-flash", supportsTools: true, fallback, generate: async () => { throw new AiProviderError("x", 503, true); } };
    await executeListingAutofill(actor, primary, { images: [img, img], audio: null, text: "2 camere" }, { client: credits, usageClient: usageSink().client });
    const msg = calls[0]!.messages[0] as { content: string; attachments: unknown[] };
    expect(msg.attachments).toEqual([]);
    expect(msg.content).toContain("2 camere");
  });

  it("isSuccess=false fără excepție → usage success:false cu provider și model", async () => {
    const primary: AIProvider = { id: "gemini", model: "gemini-3.5-flash", supportsTools: true, generate: async () => ({ text: "nu e json", toolCalls: [], inputTokens: 1, outputTokens: 1 }) };
    const sink = usageSink();
    const r = await executeListingAutofill(actor, primary, { images: [img], audio: null, text: "" }, { client: credits, usageClient: sink.client });
    expect(r.ok).toBe(false);
    expect(sink.rows).toHaveLength(1);
    expect(sink.rows[0]).toMatchObject({ provider: "gemini", model: "gemini-3.5-flash", success: false, capability: "listing_autofill" });
    expect(String((sink.rows[0]!.extra_info as { error: string }).error)).toMatch(/Răspuns invalid/);
  });

  it("excepție → usage success:false cu providerul real", async () => {
    const primary: AIProvider = { id: "gemini", model: "gemini-3.5-flash", supportsTools: true, generate: async () => { throw new AiProviderError("Providerul AI a răspuns cu 400.", 400, false); } };
    const sink = usageSink();
    await expect(executeListingAutofill(actor, primary, { images: [img], audio: null, text: "" }, { client: credits, usageClient: sink.client })).rejects.toThrow();
    expect(sink.rows[0]).toMatchObject({ provider: "gemini", model: "gemini-3.5-flash", success: false });
  });
});
