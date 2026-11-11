import { describe, expect, it, vi } from "vitest";
import { runOutreachSend, estimateDays, type SendDeps, type ClaimResult } from "./outreach-send";

type R = { id: string; email: string; status: string; claimed: boolean; claimedDay?: number };
/** In-memory model of the claim/result RPC contract (atomic claim, suppressions, window, daily limit). */
function world(opts: { n: number; suppressed?: string[]; unsubscribed?: string[]; limit?: number; inWindow?: () => boolean; sendFails?: (to: string) => false | { error: string; kind?: "auth" | "quota" } }) {
  const recipients: R[] = Array.from({ length: opts.n }, (_, i) => ({ id: `r${i}`, email: `a${i}@x.ro`, status: (opts.unsubscribed ?? []).includes(`a${i}@x.ro`) ? "unsubscribed" : "pending", claimed: false }));
  const suppressed = new Set(opts.suppressed ?? []);
  const campaign = { status: "sending", failures: 0, claimedToday: 0, limit: opts.limit ?? 100 };
  const sent: string[] = [];
  let lock = Promise.resolve();
  const atomic = <T,>(fn: () => T): Promise<T> => { const p = lock.then(fn); lock = p.then(() => undefined, () => undefined); return p; };
  const deps: SendDeps = {
    dueCampaigns: async () => (campaign.status === "sending" ? ["c1"] : []),
    claim: (id) => atomic((): ClaimResult => {
      if (campaign.status !== "sending") return { state: "not_sending" };
      for (const r of recipients) if (r.status === "pending" && !r.claimed && suppressed.has(r.email)) r.status = "unsubscribed";
      if (!recipients.some((r) => r.status === "pending")) { campaign.status = "completed"; return { state: "completed" }; }
      if (opts.inWindow && !opts.inWindow()) return { state: "outside_window" };
      if (campaign.claimedToday >= campaign.limit) return { state: "daily_limit" };
      const r = recipients.find((x) => x.status === "pending" && !x.claimed && !suppressed.has(x.email));
      if (!r) return { state: "idle" };
      r.claimed = true; campaign.claimedToday++;
      return { state: "claimed", recipient: { id: r.id, email: r.email, agency_name: "A", city: "B", unsubscribe_token: "t".repeat(64) }, campaign: { subject: "S", body_text: "Salut {{agency_name}}", sender_name: "Habitoo", footer_text: "F" } };
    }),
    recheck: async (rid) => { const r = recipients.find((x) => x.id === rid)!; return r.status === "pending" && !suppressed.has(r.email); },
    send: vi.fn(async (m) => { const f = opts.sendFails?.(m.to); if (f) return { ok: false as const, ...f }; sent.push(m.to); return { ok: true as const }; }),
    result: (rid, _c, ok, _e, fatal) => atomic(() => {
      const r = recipients.find((x) => x.id === rid)!;
      r.status = ok ? "sent" : "failed";
      if (ok) campaign.failures = 0; else { campaign.failures++; if (fatal || campaign.failures >= 5) { campaign.status = "paused"; return "paused"; } }
      if (!recipients.some((x) => x.status === "pending")) { campaign.status = "completed"; return "completed"; }
      return campaign.status;
    }),
    sleep: async () => {}, now: () => 0,
  };
  return { deps, recipients, campaign, sent, suppressed };
}

describe("outreach bulk send worker", () => {
  it("never sends to the same recipient twice under concurrent runs", async () => {
    const w = world({ n: 15 });
    await Promise.all([runOutreachSend(w.deps), runOutreachSend(w.deps), runOutreachSend(w.deps)]);
    expect(new Set(w.sent).size).toBe(w.sent.length);
    expect(w.sent.length).toBe(15);
  });
  it("processes at most 10 recipients per run", async () => {
    const w = world({ n: 25 });
    const r = await runOutreachSend(w.deps);
    expect(r.sent).toBe(10);
  });
  it("skips suppressed and unsubscribed recipients", async () => {
    const w = world({ n: 4, suppressed: ["a1@x.ro"], unsubscribed: ["a2@x.ro"] });
    await runOutreachSend(w.deps);
    expect(w.sent).toEqual(["a0@x.ro", "a3@x.ro"]);
  });
  it("skips a recipient suppressed between claim and send", async () => {
    const w = world({ n: 1 });
    const orig = w.deps.claim;
    w.deps.claim = async (id) => { const c = await orig(id); w.suppressed.add("a0@x.ro"); return c; };
    const r = await runOutreachSend(w.deps);
    expect(r.skipped).toBe(1);
    expect(w.deps.send).not.toHaveBeenCalled();
  });
  it("respects the daily limit", async () => {
    const w = world({ n: 8, limit: 3 });
    await runOutreachSend(w.deps);
    expect(w.sent.length).toBe(3);
  });
  it("sends nothing outside the send window", async () => {
    const w = world({ n: 3, inWindow: () => false });
    await runOutreachSend(w.deps);
    expect(w.sent.length).toBe(0);
  });
  it("pauses the campaign after 5 consecutive failures", async () => {
    const w = world({ n: 8, sendFails: () => ({ error: "boom" }) });
    const r = await runOutreachSend(w.deps);
    expect(r.failed).toBe(5);
    expect(w.campaign.status).toBe("paused");
    expect(w.recipients.filter((x) => x.status === "pending").length).toBe(3);
  });
  it("pauses immediately on a Gmail quota error", async () => {
    const w = world({ n: 4, sendFails: () => ({ error: "Limita", kind: "quota" }) });
    await runOutreachSend(w.deps);
    expect(w.campaign.status).toBe("paused");
    expect(w.deps.send).toHaveBeenCalledTimes(1);
  });
  it("sets completed when nothing is pending", async () => {
    const w = world({ n: 2 });
    await runOutreachSend(w.deps);
    expect(w.campaign.status).toBe("completed");
    const w2 = world({ n: 1, unsubscribed: ["a0@x.ro"] });
    await runOutreachSend(w2.deps);
    expect(w2.campaign.status).toBe("completed");
  });
  it("sends the rendered message with unsubscribe headers", async () => {
    const w = world({ n: 1 });
    await runOutreachSend(w.deps);
    const msg = vi.mocked(w.deps.send).mock.calls[0][0];
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msg.text).toContain("Salut A");
  });
  it("estimates sending days", () => {
    expect(estimateDays(250, 100, "09:00", "17:00", 20)).toBe(3);
    expect(estimateDays(0, 100, "09:00", "17:00", 20)).toBe(0);
  });
});
