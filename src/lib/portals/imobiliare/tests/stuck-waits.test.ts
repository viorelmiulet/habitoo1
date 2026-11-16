import { afterEach, describe, expect, it, vi } from "vitest";
import { withImobiliareWriteLock } from "../client.server";
import { IMOBILIARE_BLOCKED_MESSAGE, IMOBILIARE_WAIT_MS, withImobiliareTimeout } from "../wait";
import { encodeImobiliareImages } from "../media.server";

vi.mock("@/lib/watermark.server", () => ({ ensureWatermarkedPath: async () => null }));
afterEach(() => vi.useRealTimers());

describe("IM4: Imobiliare.ro waits never hang forever", () => {
  it("a write lock held by a promise that never settles times out after 20 s", async () => {
    vi.useFakeTimers();
    const key = `org:stuck-${Math.random()}`;
    void withImobiliareWriteLock(key, () => new Promise<never>(() => {}));
    const second = vi.fn(async () => "ran");
    const waiting = withImobiliareWriteLock(key, second);
    const assertion = expect(waiting).rejects.toThrow(IMOBILIARE_BLOCKED_MESSAGE);
    await vi.advanceTimersByTimeAsync(IMOBILIARE_WAIT_MS - 1);
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(second).not.toHaveBeenCalled();
    expect(IMOBILIARE_WAIT_MS).toBe(20_000);
  });

  it("a finished holder releases the lock so the next write runs", async () => {
    const key = `org:ok-${Math.random()}`;
    await withImobiliareWriteLock(key, async () => "first");
    await expect(withImobiliareWriteLock(key, async () => "second")).resolves.toBe("second");
  });

  it("generic timeout rejects with the given message", async () => {
    vi.useFakeTimers();
    const p = expect(withImobiliareTimeout(new Promise(() => {}), 1000, "blocat")).rejects.toThrow("blocat");
    await vi.advanceTimersByTimeAsync(1000);
    await p;
  });

  it("a storage download that never answers becomes an error, not a hang", async () => {
    vi.useFakeTimers();
    const rows = [{ id: "i1", storage_path: "org/p/1.jpg", position: 0, include_in_publish: true, is_confidential: false }];
    const query = { select: () => query, eq: () => query, order: async () => ({ data: rows, error: null }), maybeSingle: async () => ({ data: null }) };
    const admin = {
      from: () => query,
      storage: { from: () => ({ download: () => new Promise(() => {}) }) },
    };
    const run = encodeImobiliareImages({ admin: admin as never, organizationId: "o", propertyId: "p", sleep: async () => {} } as never);
    await vi.advanceTimersByTimeAsync(IMOBILIARE_WAIT_MS * 6);
    const result = await run;
    expect(result.images).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/nu a putut fi descărcată/);
  });
});
