import { describe, expect, it, vi } from "vitest";
import { createHouseraClient, HouseraError, resetHouseraRateState } from "./client.server";
import { exchangeHouseraCode } from "./oauth.server";
import { HOUSERA_USER_AGENT } from "./config";
import { publishHousera } from "./publish";
import { withdrawHousera } from "./withdraw";
import { mergePortalOffers } from "../imobiliare/offer-links";
import { processHouseraEventRow } from "./events.server";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ua = (init?: RequestInit) => (init?.headers as Record<string, string>)["User-Agent"];

describe("Housera H8", () => {
  it("User-Agent pe client și pe schimbul de cod", async () => {
    expect(HOUSERA_USER_AGENT).toBe("Habitoo-CRM/1.0 (+https://www.habitoo.ro)");
    resetHouseraRateState();
    const f = vi.fn(async () => json(200, { data: {} }));
    await createHouseraClient({ key: "1|hsr_test_abcdefgh", baseUrl: "https://staging.housera.ro/api/v1/", fetch: f as unknown as typeof fetch, headers: undefined } as never).request("me", { headers: { "User-Agent": "x" } });
    expect(ua(f.mock.calls[0]![1 as never])).toBe(HOUSERA_USER_AGENT);
    const g = vi.fn(async () => json(400, { error: "invalid_grant" }));
    await exchangeHouseraCode("c", "v", { env: { HOUSERA_CLIENT_ID: "a", HOUSERA_CLIENT_SECRET: "b" }, fetch: g as unknown as typeof fetch, encrypt: (v) => v, decrypt: (v) => v, store: {} as never }).catch(() => null);
    expect(ua(g.mock.calls[0]![1 as never])).toBe(HOUSERA_USER_AGENT);
  });

  it("403 fără JSON → temporar; 403 cu JSON → refuz", async () => {
    resetHouseraRateState();
    const html = vi.fn(async () => new Response("<html>challenge</html>", { status: 403, headers: { "Content-Type": "text/html" } }));
    const e1 = await createHouseraClient({ key: "1|hsr_test_abcdefgh", baseUrl: "https://x/", fetch: html as unknown as typeof fetch }).request("me").catch((e) => e);
    expect(e1).toBeInstanceOf(HouseraError);
    expect([e1.kind, e1.message]).toEqual(["temporary", "Housera a refuzat temporar cererea. Reîncercăm automat."]);
    const js = vi.fn(async () => json(403, { code: "forbidden" }));
    const e2 = await createHouseraClient({ key: "1|hsr_test_abcdefgh", baseUrl: "https://x/", fetch: js as unknown as typeof fetch }).request("me").catch((e) => e);
    expect(e2.kind).toBe("refused");
  });

  it("DELETE curăță oferta; republicarea face PUT fără If-Match și salvează noul cod", async () => {
    const stored = [{ transaction: "sale" as const, reference: "HB-1-V", id: "OLD1", url: "https://housera.ro/a/OLD1", etag: "e1", photos_hash: "h1", status: "pending" }];
    const calls: Array<{ path: string; method?: string; headers?: Record<string, string> }> = [];
    const client = {
      async requestMeta(path: string, req: { method?: string; headers?: Record<string, string> } = {}) {
        calls.push({ path, ...req });
        if (path === "account/listings/OLD1") return { status: 200, headers: new Headers(), data: { data: { status: "pending", etag: "e1" } } };
        if (req.method === "DELETE") return { status: 204, headers: new Headers(), data: null };
        if (path.startsWith("listings/ref/")) return { status: 201, headers: new Headers(), data: { data: { code: "NEW2", etag: "e9", status: "pending", url: "https://housera.ro/a/NEW2" } } };
        return { status: 200, headers: new Headers(), data: null };
      },
      async request() { return null; },
    };
    const w = await withdrawHousera({ stored, reason: "user", client: client as never });
    expect(w.removed).toEqual(["HB-1-V"]);
    const after = mergePortalOffers(stored, w.offers, w.removed);
    expect(after).toEqual([]);
    const p = await publishHousera({ drafts: [{ transaction: "sale", externalRef: "HB-1-V", payload: { a: 1 } } as never], stored: after, photoUrls: [], client: client as never });
    const put = calls.find((c) => c.path === "listings/ref/HB-1-V")!;
    expect(put.method).toBe("PUT");
    expect(put.headers?.["If-Match"]).toBeUndefined();
    expect(p.offers[0]!.id).toBe("NEW2");
    expect(p.offers[0]!.photos_hash).toBeUndefined();
  });

  it("webhook.test → procesat „test primit”, fără agenție", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const admin = { from: () => ({ update: (v: Record<string, unknown>) => { updates.push(v); return { eq: async () => ({ error: null }) }; } }) };
    const ok = await processHouseraEventRow(admin as never, "row1", null, { id: "msg_1", type: "webhook.test", connection: "999", data: {} }, 0);
    expect(ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ processed: true, process_note: "test primit" });
  });
});
