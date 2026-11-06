import { afterEach, describe, expect, it, vi } from "vitest";
import { houseraEnvMismatchPatch, houseraReadiness } from "./environment";
import { publishHousera, type HouseraClientLike } from "./publish";
import { runHouseraEventsCron } from "./cron.server";
import type { HouseraListingDraft } from "./mapper";

type Row = Record<string, unknown>;
afterEach(() => { vi.unstubAllEnvs(); });

describe("H13 mediul Housera", () => {
  it("conexiune staging + mediu production → reconectare necesară și cursor resetat", () => {
    const next = houseraEnvMismatchPatch({ housera_env: "staging", housera_events_cursor: "ev_9", oauth: { x: 1 } }, "production");
    expect(next).toMatchObject({ reconnect_required: true, housera_env_mismatch: "production", oauth: { x: 1 } });
    expect(next).not.toHaveProperty("housera_events_cursor");
    // Fără mediu salvat = staging (date vechi).
    expect(houseraEnvMismatchPatch({}, "production")).not.toBeNull();
    expect(houseraEnvMismatchPatch({ housera_env: "production" }, "production")).toBeNull();
  });

  it("ofertă staging + publicare în production → PUT fără If-Match, ofertă nouă cu mediul production, staging păstrată", async () => {
    const calls: Array<{ path: string; headers?: Record<string, string> }> = [];
    const client: HouseraClientLike = {
      requestMeta: (async (path: string, req?: { headers?: Record<string, string> }) => {
        calls.push({ path, headers: req?.headers });
        return { status: 201, headers: new Headers(), data: { data: { code: "PROD1", etag: "\"p1\"", status: "pending", url: "https://housera.ro/a/PROD1" } } };
      }) as never,
    };
    const draft = { externalRef: "ref-sale", transaction: "sale", payload: { title: "x" } } as unknown as HouseraListingDraft;
    const staging = { transaction: "sale", reference: "ref-sale", id: "STG1", url: "https://staging.housera.ro/a/STG1", etag: "\"s1\"", status: "active" };
    const r = await publishHousera({ drafts: [draft], stored: [staging], photoUrls: [], client, env: "production" });
    const put = calls.find((c) => c.path === "listings/ref/ref-sale")!;
    expect(put.headers?.["If-Match"]).toBeUndefined();
    expect(r.offers).toEqual([expect.objectContaining({ id: "PROD1", env: "production", etag: "\"p1\"" })]);
    expect(r.retained).toEqual([staging]);
  });

  it("cron-ul de evenimente ignoră conexiunile din celălalt mediu", async () => {
    vi.stubEnv("HOUSERA_ENV", "production");
    vi.stubEnv("HOUSERA_CLIENT_ID", "id");
    vi.stubEnv("HOUSERA_CLIENT_SECRET", "secret");
    const conns: Row[] = [
      { id: "c1", organization_id: "org-stg", status: "connected", portal: "housera", portal_credentials_encrypted: "x", settings: { housera_env: "staging", housera_events_cursor: "ev_5" } },
      { id: "c2", organization_id: "org-prod", status: "connected", portal: "housera", portal_credentials_encrypted: "x", settings: { housera_env: "production" } },
    ];
    const admin = {
      from(table: string) {
        const f: Array<(r: Row) => boolean> = []; let upd: Row | null = null; let ins = false;
        const rows = table === "portal_connections" ? conns : [];
        const q: Record<string, unknown> = {};
        const run = () => { if (ins) return { data: null, error: null }; const m = rows.filter((r) => f.every((p) => p(r))); if (upd) m.forEach((r) => Object.assign(r, upd)); return { data: m, error: null }; };
        Object.assign(q, {
          select: () => q, limit: () => q,
          eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; },
          not: (k: string) => { f.push((r) => r[k] != null); return q; },
          update: (p: Row) => { upd = p; return q; },
          insert: () => { ins = true; return q; },
          maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
        });
        return q;
      },
    };
    const used: string[] = [];
    const out = await runHouseraEventsCron({
      admin,
      clientFor: async (c) => { used.push(c.organization_id); return { requestMeta: (async () => ({ status: 200, headers: new Headers(), data: { data: [] } })) as never }; },
    });
    expect(used).toEqual(["org-prod"]);
    expect((out as { agencies: Row[] }).agencies.map((a) => a.organizationId)).toEqual(["org-prod"]);
    expect(conns[0]!.settings).toMatchObject({ reconnect_required: true });
    expect(conns[0]!.settings).not.toHaveProperty("housera_events_cursor");
  });

  it("lista de pregătire calculată corect", () => {
    const r = houseraReadiness({
      env: "production", clientKeys: true, webhookSecret: true, webhookResponds: true, schemaEnv: "staging",
      connections: [
        { status: "connected", hasKey: true, settings: { housera_env: "production" } },
        { status: "connected", hasKey: true, settings: { housera_env: "staging" } },
        { status: "connected", hasKey: true, settings: {} },
        { status: "disconnected", hasKey: false, settings: {} },
      ],
    });
    const ok = Object.fromEntries(r.items.map((i) => [i.id, i.ok]));
    expect(ok).toEqual({ client_keys: true, webhook_secret: true, webhook_receiver: true, schema: false, reconnect: false });
    expect(r.reconnectCount).toBe(2);
    expect(r.items.find((i) => i.id === "reconnect")!.label).toBe("2 agenții trebuie să se reconecteze");
    expect(r.items.find((i) => i.id === "webhook_secret")!.note).toContain("HOUSERA_WEBHOOK_SECRET");
  });
});
