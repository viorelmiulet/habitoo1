import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLISH_JOB_LEASE_SECONDS, PUBLISH_JOB_MAX_SILENT_ATTEMPTS, startJobHeartbeat } from "./publish-jobs.server";

/** Același predicat ca în `claim_portal_publish_jobs`: locked_at < now() - lease. */
const expired = (lockedAt: number, now: number) => lockedAt < now - PUBLISH_JOB_LEASE_SECONDS * 1000;

function fakeAdmin(row: { locked_at: number; token: string; status: string }) {
  const filters: Record<string, string> = {};
  const q: any = {
    update: (v: { locked_at: string }) => { q.v = v; return q; },
    eq: (k: string, val: string) => { filters[k] = val; if (Object.keys(filters).length === 3) {
      if (filters["claim_token"] === row.token && filters["status"] === row.status) row.locked_at = Date.parse(q.v.locked_at);
      for (const key of Object.keys(filters)) delete filters[key];
    } return q; },
  };
  return { from: () => q };
}

afterEach(() => vi.useRealTimers());

describe("heartbeat și lease", () => {
  it("lease 60 s, 3 opriri fără rezultat", () => {
    expect(PUBLISH_JOB_LEASE_SECONDS).toBe(60);
    expect(PUBLISH_JOB_MAX_SILENT_ATTEMPTS).toBe(3);
  });

  it("job cu heartbeat activ nu e preluat după 60 s", () => {
    vi.useFakeTimers({ now: 0 });
    const row = { locked_at: 0, token: "t1", status: "running" };
    const stop = startJobHeartbeat(fakeAdmin(row), { id: "j", claim_token: "t1" });
    vi.advanceTimersByTime(90_000);
    expect(expired(row.locked_at, Date.now())).toBe(false);
    stop();
  });

  it("job fără heartbeat e reluat după 60 s", () => {
    vi.useFakeTimers({ now: 0 });
    const row = { locked_at: 0, token: "t1", status: "running" };
    const stop = startJobHeartbeat(fakeAdmin(row), { id: "j", claim_token: "t1" });
    stop();
    vi.advanceTimersByTime(61_000);
    expect(expired(row.locked_at, Date.now())).toBe(true);
  });

  it("heartbeat nu atinge un rând preluat de alt worker", () => {
    vi.useFakeTimers({ now: 0 });
    const row = { locked_at: 0, token: "alt", status: "running" };
    const stop = startJobHeartbeat(fakeAdmin(row), { id: "j", claim_token: "t1" });
    vi.advanceTimersByTime(30_000);
    expect(row.locked_at).toBe(0);
    stop();
  });

  it("a treia oprire fără rezultat închide jobul cu mesajul nou", () => {
    const sql = readFileSync("drizzle/migrations/0338_portal_publish_claim_three_silent_stops.sql", "utf8");
    expect(sql).toMatch(/attempts>=3 FOR UPDATE/);
    expect(sql).toMatch(/attempts<3;/);
    expect(sql).toContain("Publicarea s-a oprit de 3 ori fără rezultat; jobul a fost închis. Reia actualizarea.");
    expect(sql).not.toContain("de 2 ori");
  });
});
