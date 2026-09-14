/**
 * Retry: doar erorile tranzitorii sunt reîncercate, cu backoff.
 */
import { describe, expect, it, vi } from "vitest";
import { classifyAiError, withRetry } from "../reliability/retry";
import { AiProviderError } from "../providers/types";

const noSleep = async () => {};

describe("classifyAiError", () => {
  it("marchează timeout-ul providerului ca tranzitoriu", () => {
    expect(classifyAiError(new AiProviderError("timeout", 504, true))).toEqual({
      retryable: true,
      reason: "provider_timeout",
    });
  });

  it("marchează 429 ca tranzitoriu", () => {
    expect(classifyAiError(new AiProviderError("busy", 429, true)).retryable).toBe(true);
  });

  it("nu reîncearcă erorile de configurare", () => {
    expect(classifyAiError(new AiProviderError("unauthorized", 401, false))).toEqual({
      retryable: false,
      reason: "terminal",
    });
  });

  it("recunoaște erorile de rețea", () => {
    expect(classifyAiError(new Error("fetch failed")).reason).toBe("network");
  });

  it("recunoaște erorile temporare de bază de date", () => {
    expect(classifyAiError(new Error("connection reset by peer")).retryable).toBe(true);
  });

  it("tratează restul ca terminale", () => {
    expect(classifyAiError(new Error("column does not exist")).retryable).toBe(false);
  });
});

describe("withRetry", () => {
  it("reîncearcă o eroare tranzitorie și reușește", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new AiProviderError("temp", 504, true))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(run, { sleep: noSleep });
    expect(result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("nu reîncearcă o eroare terminală", async () => {
    const run = vi.fn().mockRejectedValue(new AiProviderError("bad key", 401, false));
    await expect(withRetry(run, { sleep: noSleep })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("respectă numărul maxim de încercări", async () => {
    const run = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const retries: number[] = [];
    await expect(
      withRetry(run, { attempts: 3, sleep: noSleep, onRetry: (a) => retries.push(a.attempt) }),
    ).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(3);
    expect(retries).toEqual([1, 2]);
  });
});
