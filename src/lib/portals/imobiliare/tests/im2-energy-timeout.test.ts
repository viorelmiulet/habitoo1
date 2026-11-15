import { beforeEach, describe, expect, it, vi } from "vitest";

const authed = vi.fn();
const validate = vi.fn();
vi.mock("../auth.server", () => ({ imobiliareAuthedRequest: (...a: unknown[]) => authed(...a) }));
vi.mock("../promotions.server", () => ({
  fetchImobiliareListingPromotions: async () => ({ states: new Map([["energy", 0]]) }),
  fetchImobiliareSlotMembership: async () => null,
  validateImobiliareListingPromotion: (...a: unknown[]) => validate(...a),
  confirmImobiliareListingPromotion: async () => ({ ok: true, value: 0 }),
}));
vi.mock("@/lib/portals.functions", () => ({ logOperation: async () => undefined }));
vi.mock("../../promotions/allocation.server", () => ({ invalidatePromotionUsageCache: () => undefined }));
const relayFetch = vi.fn();
vi.mock("../../relay.server", () => ({ relayFetch: (...a: unknown[]) => relayFetch(...a) }));

const admin = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }) }) };
const base = { admin: admin as never, session: {} as never, organizationId: "org", propertyId: "p", reference: "HB-1366", actorId: null, mode: "combined" as const };

beforeEach(() => { authed.mockReset(); validate.mockReset(); relayFetch.mockReset(); });

describe("IM2 Imobiliare energy:0", () => {
  it("publishes online with energy 0 in one bounded POST", async () => {
    validate.mockResolvedValue({ ok: true });
    authed.mockResolvedValue({ ok: true, status: 200, body: {}, attempts: 1, durationMs: 5, classification: null });
    const { publishImobiliareOnline } = await import("../online-promotions.server");
    const result = await publishImobiliareOnline({ ...base, changes: { energy: 0 } });
    expect(result.ok).toBe(true);
    expect(authed).toHaveBeenCalledTimes(1);
    expect(authed.mock.calls[0]![1].body).toMatchObject({ status: "online", promotions: { energy: 0 } });
    expect(result.promotionErrors).toEqual([]);
  });

  it("unknown promotion or a refused promotion only warns and still publishes", async () => {
    validate.mockResolvedValue({ ok: false, code: "ALLOCATION_ERROR", message: "Fără alocare" });
    authed.mockResolvedValue({ ok: true, status: 200, body: {}, attempts: 1, durationMs: 5, classification: null });
    const { publishImobiliareOnline } = await import("../online-promotions.server");
    const result = await publishImobiliareOnline({ ...base, changes: { energy: 3, necunoscut: 1 } as never });
    expect(result.ok).toBe(true);
    expect(authed.mock.calls[0]![1].body).toEqual({ status: "online", imoradar_status: "online" });
    expect(result.promotionErrors.map((e) => e.promotionId).sort()).toEqual(["energy", "necunoscut"]);
  });
});

describe("IM2 timeouts", () => {
  it("a hung Imobiliare request ends as TIMEOUT instead of hanging", async () => {
    relayFetch.mockImplementation(() => new Promise(() => undefined));
    const { imobiliareRequest } = await import("../client.server");
    const result = await imobiliareRequest({ method: "POST", path: "/api/v1/listings/x/promotions", connectionKey: "t", body: {}, timeoutMs: 50 });
    expect(result.ok).toBe(false);
    expect(result.classification?.code).toBe("TIMEOUT");
  });

  it("a hung job is saved as a Romanian error, not left running", async () => {
    const { withJobDeadline, decideJobResult, PUBLISH_JOB_DEADLINE_MESSAGE } = await import("../../publish-jobs.server");
    let thrown: unknown;
    try { await withJobDeadline(() => new Promise(() => undefined), 20); } catch (e) { thrown = e; }
    expect(decideJobResult({ attempts: 1, portal_key: "imobiliare_ro" }, null, thrown)).toEqual({ status: "error", ok: false, message: PUBLISH_JOB_DEADLINE_MESSAGE });
  });

  it("an unexpected English exception gets a clear Romanian message", async () => {
    const { decideJobResult } = await import("../../publish-jobs.server");
    const d = decideJobResult({ attempts: 4, portal_key: "imobiliare_ro" }, null, new TypeError("x is undefined"));
    expect(d.status).toBe("error");
    expect(d.message).toMatch(/^Eroare neașteptată la publicare/);
  });
});
