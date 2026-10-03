import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function q(table: string) {
  const f: ((r: Row) => boolean)[] = [];
  let upd: Row | null = null;
  let range: [number, number] | null = null;
  const rows = () => (db[table] ?? []).filter((r) => f.every((fn) => fn(r)));
  const api: Record<string, unknown> = {};
  for (const k of ["select", "order"]) api[k] = () => api;
  api["eq"] = (c: string, v: unknown) => (f.push((r) => r[c] === v), api);
  api["neq"] = (c: string, v: unknown) => (f.push((r) => r[c] !== v), api);
  api["is"] = (c: string, v: unknown) => (f.push((r) => (r[c] ?? null) === v), api);
  api["in"] = (c: string, v: unknown[]) => (f.push((r) => v.includes(r[c])), api);
  api["range"] = (a: number, b: number) => ((range = [a, b]), api);
  api["update"] = (r: Row) => ((upd = r), api);
  api["insert"] = async (r: Row | Row[]) => {
    (db[table] ??= []).push(...(Array.isArray(r) ? r : [r]).map((x) => ({ id: `n${Math.random()}`, ...x })));
    return { error: null };
  };
  api["then"] = (res: (v: unknown) => unknown) => {
    let out = rows();
    if (upd) for (const r of out) Object.assign(r, upd);
    if (range) out = out.slice(range[0], range[1] + 1);
    return res({ data: out, error: null });
  };
  return api;
}
const admin = { from: (t: string) => q(t) } as never;
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));

const ORG = "org-a";
const OTHER = "org-b";
const prop = (id: string, org: string, extra: Row = {}) => ({
  id, organization_id: org, title: id, reference: id, publish_status: "published", deleted_at: null,
  status: "active", transaction_kind: "sale", price: 100000, currency: "EUR",
  lat: 44.4, lng: 26.1, location_precise: true, city: "București", ...extra,
});
const img = (pid: string, org: string) => ({ id: `i-${pid}`, property_id: pid, organization_id: org, include_in_publish: true, is_confidential: false, is_primary: true, position: 0, storage_path: "x" });

beforeEach(() => {
  db["properties"] = [prop("ok", ORG), prop("noprice", ORG, { price: null }), prop("foreign", OTHER)];
  db["property_images"] = [img("ok", ORG), img("noprice", ORG), img("foreign", OTHER)];
  db["portal_publications"] = [];
  db["audit_logs"] = [];
});

async function feed(org = ORG) {
  const { loadFacebookCatalogInput } = await import("./facebook-catalog.server");
  const { buildFacebookCatalogCsv } = await import("./facebook-catalog");
  const input = await loadFacebookCatalogInput(admin, org);
  return buildFacebookCatalogCsv({ ...input, baseUrl: "https://x", publicSiteUrl: "https://y" });
}
async function set(ids: string[], enabled: boolean, org = ORG) {
  const { setFacebookCatalogEnabled } = await import("./facebook-catalog-optin.server");
  return setFacebookCatalogEnabled(admin, { organizationId: org, propertyIds: ids, enabled, actorId: "u", source: "test" });
}

describe("Catalog Facebook opt-in per anunț", () => {
  it("anunț fără rând nu apare în feed", async () => {
    const r = await feed();
    expect(r.included).toBe(0);
    expect(r.excludedTotal).toBe(0);
  });
  it("activat și eligibil apare; activat dar neeligibil e la excluse cu motiv", async () => {
    await set(["ok", "noprice"], true);
    const r = await feed();
    expect(r.included).toBe(1);
    expect(r.csv).toContain("ok");
    expect(r.excludedItems).toEqual([expect.objectContaining({ id: "noprice", reason: "no_price" })]);
  });
  it("dezactivarea îl scoate din feed la următoarea citire", async () => {
    await set(["ok"], true);
    expect((await feed()).included).toBe(1);
    await set(["ok"], false);
    expect((await feed()).included).toBe(0);
  });
  it("„adaugă toate” activează doar anunțurile eligibile", async () => {
    const { facebookEligibility } = await import("./facebook-catalog-optin.server");
    const reasons = await facebookEligibility(admin, ORG);
    const eligible = [...reasons].filter(([, r]) => r === null).map(([id]) => id);
    expect(eligible).toEqual(["ok"]);
    await set(eligible, true);
    const enabled = db["portal_publications"]!.filter((r) => r["enabled"]).map((r) => r["property_id"]);
    expect(enabled).toEqual(["ok"]);
  });
  it("nu se pot activa anunțuri din altă organizație", async () => {
    expect(await set(["foreign"], true)).toBe(0);
    expect(db["portal_publications"]).toHaveLength(0);
    expect((await feed(OTHER)).included).toBe(0);
  });
  it("stări afișate", async () => {
    const { facebookListingState } = await import("@/lib/facebook-catalog-status");
    expect(facebookListingState(true, null).label).toBe("În catalog");
    expect(facebookListingState(true, "no_images").label).toBe("Activat, dar exclus: Fără poze");
    expect(facebookListingState(false, null).label).toBe("Dezactivat");
  });
});
