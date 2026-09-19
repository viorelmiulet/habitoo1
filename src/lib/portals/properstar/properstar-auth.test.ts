/**
 * Cheia din calea URL-ului: o cheie necunoscută nu deschide feedul (401), iar
 * agenția rezultă exclusiv din cheie.
 */
import { describe, expect, it, vi } from "vitest";
const VALID = "properstar_portal_a1b2c3d4.secret-value";
const { hashFeedToken } = await import("@/lib/site-feed/auth.server");
const validHash = hashFeedToken(VALID);

function table(name: string, hashCol: string, row: Record<string, unknown> | null) {
  let hash: string | null = null;
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, value: unknown) => {
      if (col === hashCol) hash = value as string;
      return api;
    },
    is: () => api,
    not: () => api,
    update: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: hash === validHash ? row : null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: hash === validHash && row ? [row] : [], error: null }).then(resolve),
  };
  void name;
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (name: string) => {
      if (name === "portal_api_keys")
        return table(name, "key_hash", {
          id: "key-1",
          organization_id: "org-1",
          portal: "properstar",
          key_prefix: "properstar_portal_a1b2c3d4",
          status: "active",
          scopes: ["feed:read"],
          expires_at: null,
          request_count: 0,
        });
      if (name === "site_feed_tokens") return table(name, "token_hash", null);
      return table(name, "none", null);
    },
  },
}));

const { authenticateFeedRequest } = await import("@/lib/site-feed/auth.server");

const request = () => new Request("https://crm.habitoo.ro/api/public/feed/properstar/x.xml");

describe("autentificarea feedului Properstar", () => {
  it("acceptă cheia corectă și determină agenția din ea", async () => {
    const auth = await authenticateFeedRequest(request(), { explicitToken: VALID });
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.organizationId).toBe("org-1");
      expect(auth.portal).toBe("properstar");
      expect(auth.scopes).toContain("feed:read");
    }
  });

  it("respinge o cheie greșită cu 401", async () => {
    const auth = await authenticateFeedRequest(request(), { explicitToken: "cheie-inventata" });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });

  it("respinge lipsa cheii cu 401", async () => {
    const auth = await authenticateFeedRequest(request(), { explicitToken: "" });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });
});
