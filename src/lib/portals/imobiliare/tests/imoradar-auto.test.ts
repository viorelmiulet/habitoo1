import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyPromotionWarnings,
  imoradarCheckboxDefault,
  readAutoImoradarSetting,
  selectImoradarBackfill,
  shouldAutoSendImoradar,
} from "../imoradar-auto";

const sent: unknown[] = [];
vi.mock("@/lib/portals/imobiliare-promotions.functions", () => ({
  prepare: async () => ({ ok: true, reference: "HB-1", session: {}, admin: {} }),
}));
vi.mock("@/lib/portals.functions", () => ({ logOperation: async () => undefined }));
vi.mock("../promotions.server", () => ({
  setImobiliareListingPromotion: async (input: { definition: { writeField: string }; value: unknown }) => {
    sent.push({ [input.definition.writeField]: input.value });
    return { ok: true, value: true, portalResponse: {}, httpStatus: 200 };
  },
}));

import { autoImoradarAfterListingAction } from "../imoradar-auto.server";

function fakeAdmin(opts: { settings?: unknown; optOut?: boolean; state?: { value_boolean: boolean; manually_stopped: boolean } | null }) {
  return {
    from: (table: string) => {
      const data =
        table === "portal_connections" ? { settings: opts.settings ?? {} }
        : table === "portal_publications" ? { imoradar_opt_out: opts.optOut === true }
        : (opts.state ?? null);
      const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error: null }) };
      return chain;
    },
  };
}

const base = { organizationId: "o", propertyId: "p", actorId: "u", ok: true } as const;

beforeEach(() => { sent.length = 0; });

describe("imoradar24 automat", () => {
  it("setarea e activă implicit", () => {
    expect(readAutoImoradarSetting({})).toBe(true);
    expect(readAutoImoradarSetting({ auto_imoradar: false })).toBe(false);
    expect(imoradarCheckboxDefault(true, false)).toBe(true);
    expect(imoradarCheckboxDefault(true, true)).toBe(false);
  });

  it("publicare reușită cu setarea activă → trimite doar promote_imoradar=true", async () => {
    const res = await autoImoradarAfterListingAction(fakeAdmin({}), { ...base, action: "publish" });
    expect(res).toBe(true);
    expect(sent).toEqual([{ promote_imoradar: true }]);
  });

  it("setare oprită → nu se trimite", async () => {
    await autoImoradarAfterListingAction(fakeAdmin({ settings: { auto_imoradar: false } }), { ...base, action: "publish" });
    expect(sent).toEqual([]);
  });

  it("debifat pe anunț → nu se trimite", async () => {
    await autoImoradarAfterListingAction(fakeAdmin({ optOut: true }), { ...base, action: "publish" });
    expect(sent).toEqual([]);
  });

  it("republicarea/actualizarea nu repornește imoradar oprit manual", async () => {
    const admin = fakeAdmin({ state: { value_boolean: false, manually_stopped: true } });
    await autoImoradarAfterListingAction(admin, { ...base, action: "update" });
    await autoImoradarAfterListingAction(admin, { ...base, action: "publish" });
    expect(sent).toEqual([]);
    expect(shouldAutoSendImoradar({ action: "update", ok: true, settingOn: true, optOut: false, state: null })).toBe(false);
  });

  it("publicare eșuată → nu se trimite", () => {
    expect(shouldAutoSendImoradar({ action: "publish", ok: false, settingOn: true, optOut: false, state: null })).toBe(false);
  });

  it("avertizarea imoradar e tolerată doar pentru imoradar", () => {
    const w = ["Promovare imoradar nu este activ pentru acest cont"];
    expect(classifyPromotionWarnings("promote_imoradar", w)).toEqual({ fail: false, tolerated: w });
    expect(classifyPromotionWarnings("tl", w).fail).toBe(true);
    expect(classifyPromotionWarnings("promote_imoradar", ["Altă eroare"]).fail).toBe(true);
  });

  it("acțiunea unică sare anunțurile cu imoradar pornit sau oprit manual", () => {
    const r = selectImoradarBackfill({
      listings: [
        { property_id: "a", status: "published", external_id: "HB-1" },
        { property_id: "b", status: "published", external_id: "HB-2" },
        { property_id: "c", status: "published", external_id: "HB-3" },
        { property_id: "d", status: "withdrawn", external_id: "HB-4" },
        { property_id: "e", status: "updated", external_id: "HB-5" },
      ],
      states: [
        { property_id: "a", value_boolean: true, manually_stopped: false },
        { property_id: "b", value_boolean: false, manually_stopped: true },
      ],
      optOuts: [],
    });
    expect(r.queued).toEqual(["c", "e"]);
    expect(r.skipped).toEqual([
      { propertyId: "a", reason: "already_on" },
      { propertyId: "b", reason: "manually_stopped" },
    ]);
  });
});
