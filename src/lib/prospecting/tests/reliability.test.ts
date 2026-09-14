/**
 * Teste pentru fiabilitatea colectării: retry numai pentru erori tranzitorii,
 * fără reîncercări pentru erori terminale sau operații non-idempotente.
 */
import { describe, expect, it, vi } from "vitest";
import { classifyAiError, withRetry } from "@/lib/ai/reliability/retry";
import { AiProviderError } from "@/lib/ai/providers/types";
import { emptyCounters } from "../workflow";

const noSleep = async () => {};

describe("retry în prospecting", () => {
  it("reîncearcă timeout-ul providerului", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new AiProviderError("timeout", 504, true))
      .mockResolvedValue("ok");
    await expect(withRetry(run, { sleep: noSleep })).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reîncearcă 429 și erorile de rețea", async () => {
    expect(classifyAiError(new AiProviderError("rate", 429, true)).retryable).toBe(true);
    expect(classifyAiError(new Error("fetch failed")).retryable).toBe(true);
    expect(classifyAiError(new AiProviderError("server", 503, true)).retryable).toBe(true);
  });

  it("NU reîncearcă erorile terminale", async () => {
    const run = vi.fn().mockRejectedValue(new AiProviderError("bad request", 400, false));
    await expect(withRetry(run, { sleep: noSleep })).rejects.toBeInstanceOf(AiProviderError);
    expect(run).toHaveBeenCalledTimes(1);
    expect(classifyAiError(new AiProviderError("unauthorized", 401, false)).retryable).toBe(false);
  });

  it("limitează numărul de încercări", async () => {
    const run = vi.fn().mockRejectedValue(new AiProviderError("timeout", 504, true));
    await expect(withRetry(run, { attempts: 3, sleep: noSleep })).rejects.toBeTruthy();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("folosește backoff crescător", async () => {
    const delays: number[] = [];
    const run = vi.fn().mockRejectedValue(new AiProviderError("timeout", 504, true));
    await withRetry(run, {
      attempts: 3,
      baseDelayMs: 100,
      sleep: async (ms) => void delays.push(ms),
      onRetry: () => {},
    }).catch(() => {});
    expect(delays).toEqual([100, 200]);
  });

  it("contoarele rulării pornesc de la zero", () => {
    expect(emptyCounters()).toEqual({
      itemsFound: 0,
      itemsNormalized: 0,
      duplicatesFound: 0,
      candidatesFound: 0,
      errorsCount: 0,
    });
  });
});
