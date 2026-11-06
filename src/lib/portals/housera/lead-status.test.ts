import { describe, expect, it, vi } from "vitest";
import { houseraStatusForStage, syncHouseraLeadStatuses } from "./lead-status.server";
import { HouseraError } from "./client.server";

type Row = Record<string, unknown>;
function db(links: Row[]) {
  return {
    links,
    from() {
      const f: Array<(r: Row) => boolean> = []; let upd: Row | null = null;
      const q: Record<string, unknown> = {};
      const run = () => { const m = links.filter((r) => f.every((p) => p(r))); if (upd) m.forEach((r) => Object.assign(r, upd)); return { data: m, error: null }; };
      Object.assign(q, {
        select: () => q, limit: () => q,
        eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; },
        not: (k: string) => { f.push((r) => r[k] != null); return q; },
        update: (p: Row) => { upd = p; return q; },
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      });
      return q;
    },
  };
}
const link = (o: Row = {}): Row => ({ id: "k1", portal: "housera", organization_id: "org", external_lead_id: "lead_1", lead_id: "L", status_desired: "offer", status_sent: null, status_remote: "new", ...o });

describe("H11 etapa lead → Housera", () => {
  it("maparea completă a etapelor", () => {
    expect(Object.fromEntries(["new", "contacted", "qualified", "viewing", "offer", "negotiation", "transaction", "won", "lost"].map((s) => [s, houseraStatusForStage(s)]))).toEqual({
      new: "new", contacted: "contacted", qualified: "contacted", viewing: "viewing", offer: "offer", negotiation: "offer", transaction: "closed", won: "closed", lost: "closed",
    });
  });

  it("schimbare → PATCH doar cu status", async () => {
    const d = db([link()]);
    const requestMeta = vi.fn(async () => ({ status: 200, headers: new Headers(), data: {} }));
    await syncHouseraLeadStatuses(d, "org", { requestMeta });
    expect(requestMeta).toHaveBeenCalledWith("leads/lead_1", expect.objectContaining({ method: "PATCH", body: { status: "offer" } }));
    expect(d.links[0]).toMatchObject({ status_desired: null, status_sent: "offer", status_remote: "offer" });
  });

  it("aceeași etapă → niciun apel", async () => {
    const d = db([link({ status_desired: "contacted", status_remote: "contacted" })]);
    const requestMeta = vi.fn();
    await syncHouseraLeadStatuses(d, "org", { requestMeta });
    expect(requestMeta).not.toHaveBeenCalled();
    expect(d.links[0]!.status_desired).toBeNull();
  });

  it("eșec temporar → rămâne în așteptare și se reia", async () => {
    const d = db([link()]);
    const fail = vi.fn(async () => { throw new HouseraError("rate_limited", "Limită", 429, "too_many_requests"); });
    expect((await syncHouseraLeadStatuses(d, "org", { requestMeta: fail })).failed).toBe(1);
    expect(d.links[0]).toMatchObject({ status_desired: "offer", status_sent: null });
    const ok = vi.fn(async () => ({ status: 200, headers: new Headers(), data: {} }));
    expect((await syncHouseraLeadStatuses(d, "org", { requestMeta: ok })).sent).toBe(1);
    expect(d.links[0]).toMatchObject({ status_desired: null, status_sent: "offer", status_sync_error: null });
  });
});
