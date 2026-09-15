import { describe, expect, it } from "vitest";
import {
  backoffMs,
  classifyLaCheieNetworkError,
  classifyLaCheieStatus,
  retryAfterMs,
} from "../http";

describe("La Cheie — politica de erori și retry", () => {
  it("2xx este succes", () => {
    expect(classifyLaCheieStatus({ status: 200, attempt: 1 }).action).toBe("ok");
    expect(classifyLaCheieStatus({ status: 204, attempt: 1 }).action).toBe("ok");
  });

  it("5xx se reia cu aceeași versiune și aceleași date", () => {
    const result = classifyLaCheieStatus({ status: 503, attempt: 1 });
    expect(result.action).toBe("retry_same");
    expect(result.waitMs).toBeGreaterThan(0);
  });

  it("5xx se oprește după numărul maxim de încercări", () => {
    expect(classifyLaCheieStatus({ status: 500, attempt: 3 }).action).toBe("stop");
  });

  it("429 respectă Retry-After", () => {
    const result = classifyLaCheieStatus({ status: 429, attempt: 1, retryAfter: "3" });
    expect(result.action).toBe("retry_after");
    expect(result.waitMs).toBe(3000);
    expect(result.code).toBe("RATE_LIMIT");
  });

  it("429 fără Retry-After folosește backoff", () => {
    expect(classifyLaCheieStatus({ status: 429, attempt: 1 }).waitMs).toBe(backoffMs(1));
  });

  it("409 cere reconciliere, nu retry orb", () => {
    const result = classifyLaCheieStatus({ status: 409, attempt: 1 });
    expect(result.action).toBe("reconcile");
    expect(result.waitMs).toBe(0);
  });

  it("400 este eroare de business, fără retry", () => {
    const result = classifyLaCheieStatus({ status: 400, attempt: 1 });
    expect(result.action).toBe("stop");
    expect(result.code).toBe("INVALID_REQUEST");
  });

  it("401 este eroare de credențiale", () => {
    expect(classifyLaCheieStatus({ status: 401, attempt: 1 }).code).toBe("AUTH_ERROR");
  });

  it("404 și 413 au mesaje proprii, sigure", () => {
    expect(classifyLaCheieStatus({ status: 404, attempt: 1 }).code).toBe("NOT_FOUND");
    const large = classifyLaCheieStatus({ status: 413, attempt: 1 });
    expect(large.action).toBe("stop");
    expect(large.message).toContain("1 MiB");
  });

  it("timeout și erori de rețea se reiau identic", () => {
    const timeout = classifyLaCheieNetworkError({ attempt: 1, timeout: true });
    expect(timeout.action).toBe("retry_same");
    expect(timeout.code).toBe("TIMEOUT");
    expect(classifyLaCheieNetworkError({ attempt: 3, timeout: false }).action).toBe("stop");
  });

  it("Retry-After acceptă și dată HTTP, mărginit", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(retryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
    expect(retryAfterMs("Thu, 01 Jan 2026 01:00:00 GMT", now)).toBe(30_000);
    expect(retryAfterMs(null)).toBe(0);
  });

  it("niciun mesaj de eroare nu conține secrete", () => {
    for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 503]) {
      const message = classifyLaCheieStatus({ status, attempt: 1 }).message;
      expect(message).not.toMatch(/bearer|authorization|api[_ -]?key/i);
    }
  });
});
