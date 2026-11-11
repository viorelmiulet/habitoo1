import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVumsiAdapter } from "../adapters/vumsi.server";
import { resetVumsiClientState } from "./client.server";
import { syncAllVumsiCompanyTypes, vumsiAllowsRealEstate, VUMSI_COMPANY_TYPE_WARNING } from "./company-type";
import { vumsiCompanyPayload } from "./mapper";
import type { VumsiCall } from "./publish";
import type { VumsiPreview } from "./preview.server";
import jpegJs from "jpeg-js";

const JPG = new Uint8Array(jpegJs.encode({ data: new Uint8Array(256).fill(200), width: 8, height: 8 }, 90).data);
const json = (status: number, body: unknown) => new Response(JSON.stringify({ status: status < 400 ? "ok" : "error", code: status, data: body }), { status, headers: { "Content-Type": "application/json" } });
const ctx = { organizationId: "o1", allowLiveRequests: true } as never;
const LU = "aaaaaaaa-0000-0000-0000-000000000001";

function preview(o: { companyUuid: string | null; synced: string | null; allowed?: boolean }): VumsiPreview {
  const allowed = o.allowed ?? true;
  return {
    ok: true, setupMissing: false, reasons: [], warnings: [], cityId: 9, cityName: "X", companyTypeAllowed: allowed,
    plans: [{ transaction: "sale", externalId: "HBT-p1-V", category: { id: 461, name: "A" }, type: 1, attrs: {}, reasons: [],
      body: { title: "T", description: "D", type: 1, category: 461, external_id: "HBT-p1-V", external_user_id: "u1", price: { amount: 1, currency: "EUR" }, location: { city_id: 9 }, attrs: {} } as never }] as never,
    user: { payload: { email: "a@x.ro", first_name: "A", last_name: "B", phone: null, external_user_id: "u1", account_type: "business" }, vumsiUuid: "uuuu", checked: true },
    company: { payload: vumsiCompanyPayload({ id: "o1", name: "X" }, { userUuid: "uuuu", externalUserId: "u1" }, { realEstate: allowed }), vumsiUuid: o.companyUuid, checked: true, typeSyncedAt: o.synced },
  };
}

function setup(pv: () => VumsiPreview, patchStatus = 200) {
  const calls: { m: string; p: string; body: any }[] = [];
  const marked: string[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const p = url.replace("https://vumsi.com/api/orion", "").split("?")[0];
    calls.push({ m: init.method!, p, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
    if (p === "/companies/by-external-id/o1/") return json(404, { errors: "nu" });
    if (init.method === "POST" && p === "/companies/") return json(201, { uuid: "cccc" });
    if (init.method === "PATCH" && p.startsWith("/companies/")) return json(patchStatus, patchStatus < 400 ? { uuid: "cccc" } : { errors: "x" });
    if (p.startsWith("/listings/by-external-id/")) return json(200, { uuid: LU, status: 2 });
    if (init.method === "PATCH") return json(200, { uuid: LU, status: 2 });
    if (p.endsWith("/images/")) return json(201, { id: 1 });
    return json(500, {});
  });
  const adapter = createVumsiAdapter({
    env: { VUMSI_API_KEY: "vumsi_test_key_123456" }, fetch: fetch as never, sleep: async () => {},
    preview: async () => pv(),
    images: async () => ({ images: [{ source: "img1", url: "https://x/1" }], warnings: [] }),
    fetchImage: async () => new Blob([JPG as BlobPart], { type: "image/jpeg" }),
    loadStored: async () => [], save: async () => {}, saveAccount: async () => {},
    markCompanyType: async (e) => { marked.push(e); },
    propertyState: async () => ({ status: "active", deleted_at: null }),
  });
  const companyPatches = () => calls.filter((c) => c.m === "PATCH" && c.p.startsWith("/companies/"));
  return { adapter, calls, marked, companyPatches };
}

beforeEach(() => resetVumsiClientState());

describe("Vumsi company_type", () => {
  it("POST companie nouă conține company_type real_estate", async () => {
    const { adapter, calls, companyPatches, marked } = setup(() => preview({ companyUuid: null, synced: null }));
    await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(calls.find((c) => c.m === "POST" && c.p === "/companies/")!.body.company_type).toBe("real_estate");
    expect(companyPatches()).toHaveLength(0);
    expect(marked).toEqual(["o1"]);
  });

  it("agenție existentă nesincronizată → exact un PATCH, apoi niciunul", async () => {
    let synced: string | null = null;
    const s = setup(() => preview({ companyUuid: "cccc", synced }));
    s.marked.push = ((e: string) => { synced = "2026-11-11T00:00:00Z"; return Array.prototype.push.call(s.marked, e); }) as never;
    await s.adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    await s.adapter.updateListing(ctx, { propertyId: "p1", externalId: "HBT-p1-V" });
    expect(s.companyPatches()).toEqual([{ m: "PATCH", p: "/companies/cccc/", body: { company_type: "real_estate" } }]);
  });

  it("PATCH eșuat → anunțul se publică, avertisment, coloana rămâne goală", async () => {
    const s = setup(() => preview({ companyUuid: "cccc", synced: null }), 400);
    const r = await s.adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.message).toContain(VUMSI_COMPANY_TYPE_WARNING);
    expect(s.marked).toEqual([]);
  });

  it("real_estate lipsă din nomenclator → câmpul nu se trimite", async () => {
    expect(vumsiAllowsRealEstate({ company_types: [{ value: "general" }, { value: "auto_dealer" }] })).toBe(false);
    expect(vumsiAllowsRealEstate({ company_types: ["general", "real_estate"] })).toBe(true);
    expect(vumsiAllowsRealEstate({})).toBe(true);
    const s = setup(() => preview({ companyUuid: null, synced: null, allowed: false }));
    await s.adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect("company_type" in s.calls.find((c) => c.m === "POST" && c.p === "/companies/")!.body).toBe(false);
    expect(s.companyPatches()).toHaveLength(0);
  });

  it("SuperAdmin: raportează reușite și eșecuri", async () => {
    const call: VumsiCall = (async (_m: string, p: string) =>
      p === "/companies/bad/" ? { ok: false, kind: "server_error", status: 500, message: "x", transient: true, retryAfterMs: null, body: null } : { ok: true, status: 200, data: {} }) as never;
    const marked: string[] = [];
    const r = await syncAllVumsiCompanyTypes(call, [
      { external_id: "a", vumsi_uuid: "good", company_type_synced_at: null },
      { external_id: "b", vumsi_uuid: "bad", company_type_synced_at: null },
      { external_id: "c", vumsi_uuid: "good2", company_type_synced_at: null },
    ], async (e) => { marked.push(e); });
    expect(r).toEqual({ succeeded: 2, failed: 1 });
    expect(marked).toEqual(["a", "c"]);
  });
});
