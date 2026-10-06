import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  clientIp,
  isStaleStoriaEvent,
  storiaEventTimestampMs,
  storiaRetryDelayMs,
  STORIA_MAX_ATTEMPTS,
  verifyNotificationSignature,
} from "./notifications.server";
import { isRetryDue, processWithinBudget, runStoriaWebhookRetry } from "./webhook-retry.server";

const SECRET = "test-secret";
const payload = {
  object_id: "43744f15-9268-4cda-a46e-ffa3c2b7182e",
  transaction_id: "3e2d3d2f-ccaf-4da7-b7ea-97234e78470f",
  flow: "publish_advert",
  event_timestamp: 1789069410,
};
const sign = (v: string) => createHmac("sha1", SECRET).update(v).digest("hex");
const good = sign(`${payload.object_id},${payload.transaction_id}`);

describe("semnătura OLX", () => {
  it("acceptă formula documentată object_id,transaction_id", () => {
    const r = verifyNotificationSignature({
      parsed: payload,
      signature: { header: "x-signature", value: good },
      secret: SECRET,
    });
    expect(r.valid).toBe(true);
  });

  it("respinge semnătura lipsă", () => {
    expect(verifyNotificationSignature({ parsed: payload, signature: null, secret: SECRET }).valid).toBe(false);
  });

  it("respinge semnătura greșită", () => {
    const r = verifyNotificationSignature({
      parsed: payload,
      signature: { header: "x-signature", value: "deadbeef" },
      secret: SECRET,
    });
    expect(r.valid).toBe(false);
  });

  it("nu mai acceptă varianta nedocumentată peste corpul brut", () => {
    const r = verifyNotificationSignature({
      parsed: payload,
      signature: { header: "x-signature", value: sign(JSON.stringify(payload)) },
      secret: SECRET,
    });
    expect(r.valid).toBe(false);
  });

  it("respinge când secretul nu e configurat", () => {
    const r = verifyNotificationSignature({
      parsed: payload,
      signature: { header: "x-signature", value: good },
      secret: null,
    });
    expect(r.valid).toBe(false);
  });
});

describe("ordinea evenimentelor", () => {
  it("normalizează secunde și milisecunde", () => {
    expect(storiaEventTimestampMs({ event_timestamp: 1789069410 })).toBe(1789069410000);
    expect(storiaEventTimestampMs({ event_timestamp: 1531735505952 })).toBe(1531735505952);
    expect(storiaEventTimestampMs({ timestamp: 1789069410 })).toBe(1789069410000);
    expect(storiaEventTimestampMs({})).toBeNull();
  });

  it("ignoră doar evenimentele strict mai vechi", () => {
    const last = new Date(1789069410000).toISOString();
    expect(isStaleStoriaEvent(1789069409000, last)).toBe(true);
    expect(isStaleStoriaEvent(1789069410000, last)).toBe(false);
    expect(isStaleStoriaEvent(1789069411000, last)).toBe(false);
    expect(isStaleStoriaEvent(1789069409000, null)).toBe(false);
  });
});

describe("reîncercări", () => {
  it("pauza crește și se oprește după 5 încercări", () => {
    expect(storiaRetryDelayMs(1)).toBe(60_000);
    expect(storiaRetryDelayMs(2)).toBe(5 * 60_000);
    expect(storiaRetryDelayMs(3)).toBe(15 * 60_000);
    expect(storiaRetryDelayMs(4)).toBe(60 * 60_000);
    expect(storiaRetryDelayMs(STORIA_MAX_ATTEMPTS)).toBeNull();
  });

  it("reia doar evenimentele scadente și sub limită", () => {
    const now = Date.parse("2026-10-06T12:00:00Z");
    const base = { id: "1", parsed_payload: {}, received_at: "2026-10-06T11:00:00Z" };
    expect(isRetryDue({ ...base, attempts: 1, next_attempt_at: "2026-10-06T11:59:00Z" }, now)).toBe(true);
    expect(isRetryDue({ ...base, attempts: 1, next_attempt_at: "2026-10-06T12:05:00Z" }, now)).toBe(false);
    expect(isRetryDue({ ...base, attempts: 5, next_attempt_at: "2026-10-06T11:00:00Z" }, now)).toBe(false);
    // Procesarea din cerere n-a terminat: preluat după 1 minut.
    expect(isRetryDue({ ...base, attempts: 0, next_attempt_at: null }, now)).toBe(true);
    expect(
      isRetryDue({ ...base, attempts: 0, next_attempt_at: null, received_at: "2026-10-06T11:58:50Z" }, now),
    ).toBe(true);
    expect(
      isRetryDue({ ...base, attempts: 0, next_attempt_at: null, received_at: "2026-10-06T11:59:30Z" }, now),
    ).toBe(false);
  });
});

describe("limitarea pe IP", () => {
  it("citește IP-ul clientului", () => {
    expect(clientIp(new Request("https://x", { headers: { "cf-connecting-ip": "1.2.3.4" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "5.6.7.8, 9.9.9.9" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("https://x"))).toBe("unknown");
  });
});

describe("procesarea în limita de timp", () => {
  it("termină în limită", async () => {
    expect(await processWithinBudget(async () => "ok", 1500)).toBe("done");
  });

  it("depășirea limitei răspunde fără să aștepte", async () => {
    const started = Date.now();
    const result = await processWithinBudget(() => new Promise((r) => setTimeout(r, 500)), 50);
    expect(result).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("o eroare nu blochează răspunsul", async () => {
    expect(await processWithinBudget(async () => { throw new Error("x"); }, 1500)).toBe("failed");
  });
});

describe("reluarea preia rândurile cu attempts = 0", () => {
  it("procesează un rând rămas fără next_attempt_at", async () => {
    const row = {
      id: "evt-0",
      parsed_payload: { flow: "publish_advert" },
      attempts: 0,
      next_attempt_at: null,
      received_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    };
    const query: Record<string, unknown> = {};
    const self = () => query;
    Object.assign(query, { select: self, eq: self, lt: self, order: self, limit: async () => ({ data: [row] }) });
    const admin = { from: () => query } as never;
    const seen: { eventId: string; attempts: number }[] = [];
    const result = await runStoriaWebhookRetry(
      admin,
      async (args) => { seen.push(args); return { processed: true }; },
      { maxItems: 10, budgetMs: 10_000 },
    );
    expect(seen).toEqual([{ eventId: "evt-0", parsed: row.parsed_payload, attempts: 0 }]);
    expect(result).toEqual({ attempted: 1, succeeded: 1 });
  });
});
