import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runHouseraAvailabilityCron } from "./cron.server";
import type { HouseraClientLike } from "./publish";
import type { PortalOffer } from "../imobiliare/offer-links";

const ORG = "org-1";
const NOW = Date.parse("2026-11-05T12:00:00Z");
const TOMORROW = "2026-11-06T12:00:00Z";

/** Bază de date simulată: filtrele se aplică efectiv pe rândurile salvate. */
type Filter = { key: string; value: unknown; kind: string };

function fakeDb(rows: Record<string, Array<Record<string, unknown>>>) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = {
    from(table: string) {
      const filters: Filter[] = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      const chain = () => q;
      const match = (cell: unknown, f: Filter): boolean => {
        if (f.kind === "eq") return cell === f.value;
        if (f.kind === "in") return Array.isArray(f.value) && f.value.includes(cell);
        if (f.kind === "is") return cell === f.value;
        if (f.kind === "not:is") return cell !== f.value;
        return true;
      };
      function run(): Array<Record<string, unknown>> {
        const list = rows[table] ?? [];
        if (op === "insert") { list.push(payload); return []; }
        if (op === "update") {
          for (const r of list) if (filters.every((f) => match(r[f.key], f))) Object.assign(r, payload);
          return [];
        }
        queries.push({ table, filters: filters.map((f) => [f.key, f.value]) });
        return list.filter((r) => filters.every((f) => match(r[f.key], f)));
      }
      Object.assign(q, {
        select: chain,
        eq: (k: string, v: unknown) => { filters.push({ key: k, value: v, kind: "eq" }); return q; },
        in: (k: string, v: unknown[]) => { filters.push({ key: k, value: v, kind: "in" }); return q; },
        is: (k: string, v: unknown) => { filters.push({ key: k, value: v, kind: "is" }); return q; },
        not: (k: string, op2: string, v: unknown) => { filters.push({ key: k, value: v, kind: `not:${op2}` }); return q; },
        limit: chain,
        order: chain,
        insert: (row: Record<string, unknown>) => { op = "insert"; payload = row; return q; },
        update: (p: Record<string, unknown>) => { op = "update"; payload = p; return q; },
        maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
      });
      return q;
    },
  };
  return { admin, queries };
}

const offer = (): PortalOffer => ({ transaction: "sale", reference: "HB-p1-sale", id: "HEWPUTA8", url: "u", status: "active", etag: `"v2"` });

/** Client fals: înregistrează apelurile, răspunde la listă și la confirmare. */
function fakeClient() {
  const calls: string[] = [];
  const client = {
    requestMeta: async (path: string, req?: { method?: string }) => {
      calls.push(`${req?.method ?? "GET"} ${path}`);
      if (path === "account/listings") {
        return { status: 200, headers: new Headers(), data: { data: [{ code: "HEWPUTA8", status: "active", etag: `"v2"`, external_ref: "HB-p1-sale", availability: { confirm_by: TOMORROW } }], meta: { next_cursor: null } } };
      }
      return { status: 200, headers: new Headers(), data: { data: { status: "active", etag: `"v3"` } } };
    },
  } as unknown as HouseraClientLike;
  return { calls, client };
}

const rowsFor = (publishStatus: string) => ({
  portal_connections: [{ id: "c1", organization_id: ORG, portal_credentials_encrypted: "enc", settings: {} }],
  portal_listings: [{ id: "L1", organization_id: ORG, portal: "housera", property_id: "p1", status: "published", portal_offers: [offer()] }],
  portal_publications: [{ organization_id: ORG, portal_key: "housera", enabled: true, property_id: "p1" }],
  properties: [{ id: "p1", status: "active", publish_status: publishStatus, deleted_at: null }],
  portal_operation_logs: [],
});

const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ["HOUSERA_CLIENT_ID", "HOUSERA_CLIENT_SECRET", "HOUSERA_ENV"]) saved[k] = process.env[k];
  process.env["HOUSERA_CLIENT_ID"] = "1";
  process.env["HOUSERA_CLIENT_SECRET"] = "secret";
  delete process.env["HOUSERA_ENV"];
});
afterAll(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("cronul de disponibilitate Housera", () => {
  it("proprietate activă dar nepublicată → fără apel confirm", async () => {
    const db = fakeDb(rowsFor("unpublished"));
    const { calls, client } = fakeClient();
    const r = await runHouseraAvailabilityCron(NOW, { admin: db.admin, clientFor: async () => client });
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([]);
    expect(r).toMatchObject({ ok: true });
    const out = (r as { agencies: Array<Record<string, unknown>> }).agencies[0]!;
    expect(out).toMatchObject({ organizationId: ORG, confirmed: 0, skipped: 1 });
  });

  it("proprietate activă și publicată → confirm", async () => {
    const db = fakeDb(rowsFor("published"));
    const { calls, client } = fakeClient();
    const r = await runHouseraAvailabilityCron(NOW, { admin: db.admin, clientFor: async () => client });
    expect(calls).toContain("POST listings/HEWPUTA8/confirm");
    const out = (r as { agencies: Array<Record<string, unknown>> }).agencies[0]!;
    expect(out).toMatchObject({ organizationId: ORG, confirmed: 1, skipped: 0 });
  });
});
