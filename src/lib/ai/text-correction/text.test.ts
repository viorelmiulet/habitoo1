import { describe, expect, it, vi } from "vitest";
import { correctTextWithFallback, isSafeTextCorrection, normalizeListingText, TEXT_CORRECTION_BASIC, TEXT_CORRECTION_REJECTED } from "./text";
import { executeTextCorrection } from "./correction.server";
import { AiProviderError, type AIProvider } from "../providers/types";
import { sanitizeAutofillResponse } from "../listing-autofill/schema";

describe("AI15 — invariants", () => {
  it("autofill normalizes generated titles and descriptions too", () => {
    const result = sanitizeAutofillResponse({ fields: [], title: "APARTAMENT MILITARI", description: "APARTAMENT  LINIŞTIT" }, { spokenText: "Apartament Militari liniștit", photoCount: 0 });
    expect(result?.title).toBe("Apartament Militari");
    expect(result?.description).toBe("Apartament liniștit");
  });
  it("normalizes uppercase and preserves the acronym allowlist and locality", () => {
    expect(normalizeListingText("APARTAMENT 2 CAMERE MILITARI PAD CF ANCPI AC LED")).toBe("Apartament 2 camere Militari PAD CF ANCPI AC LED");
    expect(normalizeListingText("APARTAMENT CU TV SI AC")).toBe("Apartament cu tv si AC");
  });
  it("uses comma diacritics and keeps paragraphs and lists", () => {
    expect(normalizeListingText("Şosea  liniştită\n\n- ţevi  noi")).toBe("Șosea liniștită\n\n- țevi noi");
  });
  it("only converts casing above 70% uppercase", () => {
    expect(normalizeListingText("ABCdefghi")).toBe("ABCdefghi");
  });
  it("rejects modified numbers, including phone components", async () => {
    const original = "Apartament 2 camere, 65 mp. Telefon 0722 123 456.";
    expect(isSafeTextCorrection(original, original.replace("65", "66"))).toBe(false);
    expect(isSafeTextCorrection(original, original.replace("456", "457"))).toBe(false);
    expect(await correctTextWithFallback(original, async () => original.replace("65", "66"))).toEqual({ ok: false, message: TEXT_CORRECTION_REJECTED });
  });
  it("rejects length beyond ±15%, but accepts the boundary", () => {
    expect(isSafeTextCorrection("a".repeat(100), "a".repeat(115))).toBe(true);
    expect(isSafeTextCorrection("a".repeat(100), "a".repeat(116))).toBe(false);
    expect(isSafeTextCorrection("a".repeat(100), "a".repeat(84))).toBe(false);
  });
  it("rejects new emails and URLs", () => {
    expect(isSafeTextCorrection("Contact agent@firma.ro", "Contact agent@noua.ro")).toBe(false);
    expect(isSafeTextCorrection("Detalii www.firma.ro", "Detalii www.noua.ro")).toBe(false);
    expect(normalizeListingText("APARTAMENT WWW.FIRMA.RO AGENT@FIRMA.RO")).toContain("WWW.FIRMA.RO AGENT@FIRMA.RO");
  });
  it("accepts a valid correction", async () => {
    const original = "Apartament 2 camere Militari, 65 mp utili";
    const corrected = "Apartament 2 camere, Militari, 65 mp utili.";
    expect(await correctTextWithFallback(original, async () => corrected)).toEqual({ ok: true, text: corrected, basic: false });
  });
  it("uses only the deterministic pre-pass when AI fails", async () => {
    expect(await correctTextWithFallback("APARTAMENT  2 CAMERE MILITARI", async () => { throw new Error("503"); })).toEqual({ ok: true, text: "Apartament 2 camere Militari", basic: true, message: TEXT_CORRECTION_BASIC });
  });
  it("consumes credits only for a valid correction", async () => {
    const provider: AIProvider = { id: "gemini", model: "test", supportsTools: false, generate: async () => ({ text: "Apartament 2 camere", toolCalls: [], inputTokens: 1, outputTokens: 1 }) };
    const rpc = vi.fn().mockResolvedValue({ data: "r", error: null });
    const result = await executeTextCorrection({ organizationId: "o", userId: "u" }, provider, "APARTAMENT 2 CAMERE", "title", { client: { rpc } });
    expect(result).toEqual({ ok: true, text: "Apartament 2 camere", basic: false });
    expect(rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "r", p_success: true });
  });
  it("charges text_fast, tries Mistral and refunds/logs the real failing model", async () => {
    const primaryError = new AiProviderError("Indisponibil", 503, true);
    const fallback: AIProvider = { id: "mistral", model: "mistral-test", supportsTools: false, generate: vi.fn().mockRejectedValue(primaryError) };
    const primary: AIProvider = { id: "gemini", model: "gemini-test", supportsTools: false, fallback, generate: vi.fn().mockRejectedValue(primaryError) };
    const rpc = vi.fn().mockResolvedValue({ data: "reservation", error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const result = await executeTextCorrection({ organizationId: "o", userId: "u" }, primary, "APARTAMENT 2 CAMERE", "title", { client: { rpc }, usageClient: { from: () => ({ insert }) } });
    expect(result).toMatchObject({ ok: true, basic: true, message: TEXT_CORRECTION_BASIC });
    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("ai_credit_reserve", expect.objectContaining({ p_action: "text_fast" }));
    expect(rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "reservation", p_success: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ success: false, provider: "mistral", model: "mistral-test", capability: "text_correction" }));
  });
  it("invalid AI output refunds and logs instead of presenting unsafe text", async () => {
    const provider: AIProvider = { id: "gemini", model: "test", supportsTools: false, generate: async () => ({ text: "Apartament 3 camere", toolCalls: [], inputTokens: 1, outputTokens: 1 }) };
    const rpc = vi.fn().mockResolvedValue({ data: "r", error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    expect(await executeTextCorrection({ organizationId: "o", userId: "u" }, provider, "Apartament 2 camere", "title", { client: { rpc }, usageClient: { from: () => ({ insert }) } })).toEqual({ ok: false, message: TEXT_CORRECTION_REJECTED });
    expect(rpc).toHaveBeenCalledWith("ai_credit_settle", { p_id: "r", p_success: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ success: false, provider: "gemini" }));
  });
});