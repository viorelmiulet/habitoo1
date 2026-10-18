import { describe, it, expect, vi } from "vitest";
import { sendSubscriptionEmail, type SubscriptionEmailEvidence } from "./subscription-request-email";

const data = { requestId: "request-123", agency: "Agenția mea", plan: "pro", term: "12m", requester: "Administrator", note: "Activare anuală" };
describe("subscription request emails", () => {
  it("sends one event to the operational inbox and records its content and timestamp", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });
    const save = vi.fn();
    const result = await sendSubscriptionEmail(data, "contact@habitoo.ro", { send, save, now: () => "2026-10-18T04:46:00Z" });
    expect(send).toHaveBeenCalledExactlyOnceWith(data, "contact@habitoo.ro", "subscription-request-request-123");
    expect(result.status).toBe("sent");
    expect(result.sentAt).toBe("2026-10-18T04:46:00Z");
    expect(result.text).toContain("240€/an");
    expect(result.text).toContain("Activare anuală");
    expect(save).toHaveBeenCalledExactlyOnceWith(result);
  });
  it("keeps the event-derived idempotency key stable on retries", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });
    const deps = { send, save: async (_e: SubscriptionEmailEvidence) => {}, now: () => "now" };
    await sendSubscriptionEmail(data, "contact@habitoo.ro", deps);
    await sendSubscriptionEmail(data, "contact@habitoo.ro", deps);
    expect(send.mock.calls.map(call => call[2])).toEqual(["subscription-request-request-123", "subscription-request-request-123"]);
  });
  it("does not claim an unsuccessful send was sent or fail the saved request", async () => {
    const result = await sendSubscriptionEmail(data, "contact@habitoo.ro", { send: async () => { throw new Error("provider failed"); }, save: async () => {}, now: () => "now" });
    expect(result.status).toBe("failed");
    expect(result.sentAt).toBeNull();
  });
  it("records suppression without retrying or claiming success", async () => {
    const send = vi.fn().mockResolvedValue({ sent: false });
    const result = await sendSubscriptionEmail(data, "contact@habitoo.ro", { send, save: async () => {}, now: () => "now" });
    expect(result.status).toBe("suppressed");
    expect(result.sentAt).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});