import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

process.env["PORTAL_CREDENTIALS_KEY"] = "test-key-for-catalog";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { site_feed_tokens: [], audit_logs: [], portal_api_keys: [] };

function q(table: string) {
  const filters: [string, string, unknown][] = [];
  let pendingUpdate: Row | null = null;
  const match = () =>
    (tables[table] ?? []).filter((r) =>
      filters.every(([op, c, v]) =>
        op === "eq" ? r[c] === v : op === "is" ? (r[c] ?? null) === v : (v as unknown[]).includes(r[c]),
      ),
    );
  const api: Record<string, unknown> = {};
  api["select"] = () => api;
  api["order"] = () => api;
  api["limit"] = () => api;
  api["eq"] = (c: string, v: unknown) => (filters.push(["eq", c, v]), api);
  api["is"] = (c: string, v: unknown) => (filters.push(["is", c, v]), api);
  api["in"] = (c: string, v: unknown) => (filters.push(["in", c, v]), api);
  api["maybeSingle"] = async () => ({ data: match()[0] ?? null, error: null });
  api["update"] = (row: Row) => ((pendingUpdate = row), api);
  api["insert"] = async (row: Row) => {
    (tables[table] ??= []).push({ revoked_at: null, ...row, id: `id${Math.random()}` });
    return { error: null };
  };
  api["then"] = (resolve: (v: unknown) => unknown) => {
    const rows = match();
    if (pendingUpdate) for (const r of rows) Object.assign(r, pendingUpdate);
    return resolve({ data: rows, error: null });
  };
  return api;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => q(t) },
}));

const ORG = "org-mrm";
const logSpy = vi.spyOn(console, "log");

beforeEach(() => {
  tables["site_feed_tokens"] = [];
  tables["audit_logs"] = [];
});

async function addToken(scope: "site" | "facebook_catalog") {
  const { generateFeedToken } = await import("./auth.server");
  const g = generateFeedToken();
  tables["site_feed_tokens"]!.push({
    id: `t-${scope}`, organization_id: ORG, token_prefix: g.prefix, token_hash: g.hash,
    revoked_at: null, request_count: 0, scope,
  });
  return g.token;
}
const req = (token: string) =>
  new Request(`https://x/api?token=${token}`, { headers: { authorization: `Bearer ${token}` } });

describe("tokenul dedicat Catalogului Facebook", () => {
  it("criptare/decriptare corectă", async () => {
    const { encryptPortalCredential, decryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const enc = encryptPortalCredential("hbt_ab.secret");
    expect(enc).not.toContain("secret");
    expect(decryptPortalCredential(enc)).toBe("hbt_ab.secret");
  });

  it("acceptat pe catalog, respins pe celelalte endpointuri", async () => {
    const { authenticateFeedRequest } = await import("./auth.server");
    const token = await addToken("facebook_catalog");
    expect((await authenticateFeedRequest(req(token), { allowFacebookCatalogToken: true })).ok).toBe(true);
    const other = await authenticateFeedRequest(req(token));
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.status).toBe(401);
  });

  it("tokenul de site rămâne acceptat pe catalog", async () => {
    const { authenticateFeedRequest } = await import("./auth.server");
    const token = await addToken("site");
    expect((await authenticateFeedRequest(req(token), { allowFacebookCatalogToken: true })).ok).toBe(true);
    expect((await authenticateFeedRequest(req(token))).ok).toBe(true);
  });

  it("regenerarea revocă doar tokenul vechi de catalog; adresa nu apare în audit/loguri", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rotateFacebookCatalogToken, loadFacebookCatalogFeedUrl } = await import("./facebook-catalog-token.server");
    await addToken("site");
    const first = await rotateFacebookCatalogToken(supabaseAdmin as never, ORG, "u1");
    expect(first.regenerated).toBe(false);
    const second = await rotateFacebookCatalogToken(supabaseAdmin as never, ORG, "u1");
    expect(second.regenerated).toBe(true);
    const rows = tables["site_feed_tokens"]!;
    expect(rows.find((r) => r["scope"] === "site")!["revoked_at"]).toBeNull();
    const fb = rows.filter((r) => r["scope"] === "facebook_catalog");
    expect(fb.filter((r) => r["revoked_at"] === null)).toHaveLength(1);
    expect(await loadFacebookCatalogFeedUrl(supabaseAdmin as never, ORG)).toBe(second.url);
    const tokenValue = decodeURIComponent(second.url.split("token=")[1]!);
    expect(String(fb.at(-1)!["token_hash"])).not.toContain(tokenValue);
    expect(JSON.stringify(tables["audit_logs"])).not.toContain(tokenValue);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(tokenValue);
  });
});

describe("acces la funcția server", () => {
  it("verifică is_org_admin și agenția vine din sesiune; răspuns no-store", () => {
    const fn = readFileSync("src/lib/facebook-catalog.functions.ts", "utf8");
    expect(fn).toContain('rpc("is_org_admin")');
    expect(fn).toMatch(/generateFacebookCatalogToken[\s\S]*requireCatalogAdmin/);
    expect(fn).toContain('setResponseHeader("Cache-Control", "no-store")');
    expect(fn).not.toMatch(/organizationId:\s*z\./);
  });
  it("adresa se citește doar pentru scope facebook_catalog", () => {
    const src = readFileSync("src/lib/site-feed/facebook-catalog-token.server.ts", "utf8");
    expect(src).toMatch(/select\("token_encrypted"\)[\s\S]*eq\("scope", FACEBOOK_CATALOG_SCOPE\)/);
  });
  it("logul de acces nu primește tokenul", () => {
    const src = readFileSync("src/lib/site-feed/auth.server.ts", "utf8");
    expect(src).not.toMatch(/logFeedAccess\(\{[^}]*\btoken\b:/);
  });
});
