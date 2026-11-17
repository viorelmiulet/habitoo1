import { afterEach, describe, expect, it, vi } from "vitest";
import { executeListingAutofill, autofillFailureMessage, AUTOFILL_OVERLOADED_MESSAGE } from "./charge.server";
import { AiProviderError, type AIProvider } from "../providers/types";
import { createGeminiProvider } from "../providers/gemini.server";
import { resolveAutofillReserve } from "../providers/registry.server";
import { buildAutofillRequest } from "./autofill.server";
import { autofillCatalogForPrompt } from "./schema";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const success = { text: '{"fields":[]}', toolCalls: [], inputTokens: 1, outputTokens: 1 };
const actor = { organizationId: "org", userId: "user" };
function setup() {
  const rows: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string) => ({ data: name === "ai_credit_reserve" ? "reservation" : null, error: null }));
  return { rows, options: { client: { rpc }, usageClient: { from: () => ({ insert: async (r: Record<string, unknown>) => { rows.push(r); return { error: null }; } }) }, fallbackDelayMs: 0 }, rpc };
}
function provider(id: string, generate: AIProvider["generate"], fallback?: AIProvider): AIProvider {
  return { id, model: id === "gemini" ? "gemini-3.5-flash" : "mistral-small-latest", supportsTools: true, generate, fallback };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("AI19 autofill recovery", () => {
  it("503 uses the configured Mistral reserve once", async () => {
    const reserve = provider("mistral", vi.fn(async () => success));
    const primary = provider("gemini", vi.fn(async () => { throw new AiProviderError("503", 503, true); }), reserve);
    const s = setup();
    expect((await executeListingAutofill(actor, primary, { images: [], text: "Apartament 3 camere" }, s.options)).ok).toBe(true);
    expect(reserve.generate).toHaveBeenCalledTimes(1);
    expect(s.rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "reservation", p_success: true });
    expect(s.rows[0]).toMatchObject({ provider: "mistral", fallback_used: true, extra_info: { attempts: [{ provider: "gemini", status: 503 }, { provider: "mistral", status: 200 }] } });
  });
  it("primary timeout aborts the call and runs reserve", async () => {
    let signal: AbortSignal | undefined;
    const reserve = provider("mistral", vi.fn(async () => success));
    const primary = provider("gemini", (r) => { signal = r.signal; return new Promise(() => {}); }, reserve);
    const s = setup();
    expect((await executeListingAutofill(actor, primary, { images: [], text: "2 camere" }, { ...s.options, primaryTimeoutMs: 10 })).ok).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(reserve.generate).toHaveBeenCalledTimes(1);
    expect(s.rows[0]).toMatchObject({ extra_info: { attempts: [{ status: 504 }, { status: 200 }] } });
  });
  it("missing Mistral uses flash-lite with the same photos and compact request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    vi.stubEnv("MISTRAL_API_KEY", "");
    let body: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: success.text }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const primary = provider("gemini", async () => { throw new AiProviderError("503", 503, true); });
    expect(resolveAutofillReserve(primary)?.model).toBe("gemini-3.5-flash-lite");
    const s = setup();
    await executeListingAutofill(actor, primary, { images: [{ mimeType: "image/jpeg", base64: "AAAA" }], text: "3 camere" }, s.options);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("gemini-3.5-flash-lite");
    expect(body).toMatchObject({ generationConfig: { maxOutputTokens: 4500, thinkingConfig: { thinkingLevel: "low" } }, contents: [{ parts: [{ text: expect.stringContaining("3 camere") }, { inlineData: { data: "AAAA" } }] }] });
  });
  it("final failure records final provider/model, durations and both attempts, then refunds", async () => {
    const reserve = provider("mistral", async () => { throw new AiProviderError("overload", 503, true); });
    const primary = provider("gemini", async () => { throw new AiProviderError("timeout", 504, true); }, reserve);
    const s = setup();
    await expect(executeListingAutofill(actor, primary, { images: [], text: "x" }, s.options)).rejects.toMatchObject({ status: 503 });
    expect(s.rows[0]).toMatchObject({ provider: "mistral", model: "mistral-small-latest", success: false, latency_ms: expect.any(Number), extra_info: { attempts: [{ provider: "gemini", status: 504, ms: expect.any(Number) }, { provider: "mistral", status: 503, ms: expect.any(Number) }] } });
    expect(s.rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "reservation", p_success: false });
  });
  it("permission denials never invoke a reserve", async () => {
    const reserve = provider("mistral", vi.fn(async () => success));
    const primary = provider("gemini", async () => { throw new AiProviderError("denied", 403); }, reserve);
    const s = setup();
    await expect(executeListingAutofill(actor, primary, { images: [], text: "x" }, s.options)).rejects.toMatchObject({ status: 403 });
    expect(reserve.generate).not.toHaveBeenCalled();
  });
  it("autofill disables the slow same-model 503 retry, other requests retain it", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createGeminiProvider("test").generate(buildAutofillRequest({ images: [], text: "x" }))).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("503/timeout have the exact user-facing message", () => {
    expect(autofillFailureMessage(new AiProviderError("503", 503))).toBe(AUTOFILL_OVERLOADED_MESSAGE);
    expect(autofillFailureMessage(new AiProviderError("timeout", 504))).toBe("AI-ul este momentan supraîncărcat. Încearcă din nou peste un minut.");
  });
  it("catalog occurs only once and the request uses 4500 tokens and low thinking", () => {
    const request = buildAutofillRequest({ images: [], text: "x" });
    expect(request.maxOutputTokens).toBe(4500);
    expect(request.thinkingLevel).toBe("low");
    expect(request.system.split(autofillCatalogForPrompt())).toHaveLength(2);
  });
});