/**
 * Tokenul semnat din indexul ClickImob în feedul /api/public/sites/v1.
 * Fără date reale: DB și indexul sunt simulate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "test-clickimob-index-key-0123456789abcdef";
process.env["CLICKIMOB_INDEX_KEY"] = KEY;

const ORG_A = "04041622-b3d2-4cbe-a2aa-000000000001"; // hb04041622b3d24cbea2
const ORG_B = "0b0b0b0b-0b00-004a-00a8-000000000002";
const ORG_OUT = "0c0c0c0c-0c00-004a-00a8-000000000003";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const inserts: { table: string; row: Row }[] = [];
const indexed = new Map<string, "active" | "grace">();

function query(table: string) {
  const filters: [string, string, unknown][] = [];
  let insertRow: Row | null = null;
  const rows = () =>
    (db[table] ?? []).filter((r) =>
      filters.every(([op, c, v]) =>
        op === "eq" ? r[c] === v : op === "in" ? (v as unknown[]).includes(r[c]) : true,
      ),
    );
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), api),
    in: (c: string, v: unknown) => (filters.push(["in", c, v]), api),
    is: () => api,
    not: () => api,
    order: () => api,
    limit: () => api,
    range: () => api,
    update: () => api,
    insert: (row: Row) => {
      insertRow = { id: `${table}-new`, ...row };
      inserts.push({ table, row: insertRow });
      return api;
    },
    single: async () => ({ data: insertRow, error: null }),
    maybeSingle: async () => ({ data: insertRow ?? rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: insertRow ? [insertRow] : rows(),
        count: rows().length,
        error: null,
      }).then(resolve),
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => query(t) },
}));

vi.mock("@/lib/portals/clickimob/index-feed.server", async () => {
  const { properstarEntityId } = await import("@/lib/portals/properstar/mapper");
  return {
    listClickimobIndexedAgencies: async () =>
      [...indexed.entries()].map(([org, status]) => ({ id: properstarEntityId("hb", org), status })),
  };
});

const { clickimobFeedToken } = await import("@/lib/portals/clickimob/index-feed");
const { properstarEntityId } = await import("@/lib/portals/properstar/mapper");
const { authenticateFeedRequest, withFeedAuth, hashFeedToken } = await import(
  "@/lib/site-feed/auth.server"
);
const { handlePropertiesList, handlePropertyDetail } = await import(
  "@/lib/site-feed/handlers.server"
);
const { Route: ContactsRoute } = await import("@/routes/api/public/sites/v1/contacts");

const tokenFor = (org: string) => clickimobFeedToken(properstarEntityId("hb", org), KEY);
const req = (token: string, path = "properties", init?: RequestInit) =>
  new Request(`https://crm.habitoo.ro/api/public/sites/v1/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });

function property(id: string, org: string): Row {
  return {
    id,
    organization_id: org,
    reference: id.toUpperCase(),
    publish_status: "published",
    status: "active",
    deleted_at: null,
    title: id,
    transaction: "sale",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  inserts.length = 0;
  indexed.clear();
  db["organizations"] = [{ id: ORG_A }, { id: ORG_B }, { id: ORG_OUT }];
  db["properties"] = [property("p-sel", ORG_A), property("p-other", ORG_A), property("p-b", ORG_B)];
  db["portal_publications"] = [
    { organization_id: ORG_A, property_id: "p-sel", portal_key: "clickimob", enabled: true },
    { organization_id: ORG_A, property_id: "p-other", portal_key: "properstar", enabled: true },
  ];
  indexed.set(ORG_A, "active");
  indexed.set(ORG_B, "grace");
});

describe("token ClickImob din index în /sites/v1", () => {
  it("token valid → cheie de portal ClickImob a agenției, doar ofertele bifate", async () => {
    const auth = await authenticateFeedRequest(req(tokenFor(ORG_A)));
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    expect(auth.organizationId).toBe(ORG_A);
    expect(auth.portal).toBe("clickimob");
    expect(auth.scopes).toEqual(["feed:read", "agents:read", "leads:write"]);
    expect(auth.tokenPrefix).toBe(`hbci_${properstarEntityId("hb", ORG_A)}`);
    expect(auth.tokenPrefix).not.toContain(".");

    const list = await handlePropertiesList(req(tokenFor(ORG_A)), auth);
    const body = (await list.response.json()) as { data: Record<string, unknown>[] };
    expect(body.data).toHaveLength(1);
    expect(JSON.stringify(body.data[0])).toContain("P-SEL");
    expect(JSON.stringify(body.data)).not.toContain("P-OTHER");

    const nebifat = await handlePropertyDetail(req(tokenFor(ORG_A)), auth, "p-other");
    expect(nebifat.response.status).toBe(404);
  });

  it("token modificat → 401, iar jurnalul nu conține semnătura", async () => {
    const t = tokenFor(ORG_A);
    const bad = t.slice(0, -1) + (t.endsWith("0") ? "1" : "0");
    const res = await withFeedAuth(req(bad), "properties", async () => ({
      response: new Response("nu"),
    }));
    expect(res.status).toBe(401);
    const log = inserts.find((i) => i.table === "site_feed_access_logs");
    expect(log?.row.token_prefix).toBe(`hbci_${properstarEntityId("hb", ORG_A)}`);
    expect(JSON.stringify(log?.row)).not.toContain(t.split(".")[1]!);
  });

  it("organizație care nu e în index → 401", async () => {
    const auth = await authenticateFeedRequest(req(tokenFor(ORG_OUT)));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });

  it("agenție în grace → listă goală și 404 la detaliu", async () => {
    const auth = await authenticateFeedRequest(req(tokenFor(ORG_B)));
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    expect(auth.indexStatus).toBe("grace");
    const list = await handlePropertiesList(req(tokenFor(ORG_B)), auth);
    const body = (await list.response.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
    const detail = await handlePropertyDetail(req(tokenFor(ORG_B)), auth, "p-b");
    expect(detail.response.status).toBe(404);
  });

  it("POST /contacts cu tokenul → lead creat în organizația corectă", async () => {
    const handlers = ContactsRoute.options.server!.handlers as unknown as {
      POST: (ctx: { request: Request }) => Promise<Response>;
    };
    const res = await handlers.POST({
      request: req(tokenFor(ORG_A), "contacts", {
        method: "POST",
        body: JSON.stringify({ nume: "Ion Test", email: "ion@test.invalid" }),
      }),
    });
    expect(res.status).toBe(201);
    const lead = inserts.find((i) => i.table === "leads");
    expect(lead?.row.organization_id).toBe(ORG_A);
  });

  it("tokenurile de site și cheile de portal existente funcționează neschimbat", async () => {
    const site = "hbt_a1b2c3d4.site-secret";
    const portal = "clickimob_portal_a1b2c3d4.portal-secret";
    db["site_feed_tokens"] = [
      { id: "t1", organization_id: ORG_B, token_prefix: "hbt_a1b2c3d4", token_hash: hashFeedToken(site), request_count: 0 },
    ];
    db["portal_api_keys"] = [
      {
        id: "k1",
        organization_id: ORG_A,
        portal: "clickimob",
        key_prefix: "clickimob_portal_a1b2c3d4",
        key_hash: hashFeedToken(portal),
        status: "active",
        scopes: ["feed:read"],
        expires_at: null,
        request_count: 0,
      },
    ];
    const a = await authenticateFeedRequest(req(site));
    expect(a.ok && a.source === "site_token" && a.portal === null && a.organizationId === ORG_B).toBe(true);
    const b = await authenticateFeedRequest(req(portal));
    expect(b.ok && b.source === "portal_key" && b.portal === "clickimob" && b.organizationId === ORG_A).toBe(true);
    if (b.ok) expect(b.indexStatus).toBeUndefined();
  });
});
