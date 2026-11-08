import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: true, keys: [] as Record<string, unknown>[], inserted: [] as Record<string, unknown>[] }));
vi.mock("@tanstack/react-start", () => ({ createIsomorphicFn: () => ({ client: () => ({ server: (fn: () => unknown) => fn }) }), createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain,
    handler: (handler: (args: unknown) => unknown) => (args?: { data?: unknown }) => handler({ data: args?.data, context: {
      userId: "11111111-1111-4111-8111-111111111111", supabase: { rpc: async () => ({ data: state.allowed, error: null }),
        from: () => ({ insert: async (value: Record<string, unknown>) => { state.inserted.push(value); return { error: null }; } }) },
    } }),
  }; return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/dynamic-feed-portals.server", async () => {
  const { INDEX_PORTALS } = await import("@/lib/portals/clickimob/index-feed");
  return { loadDynamicFeedPortals: async () => [], resolveIndexPortal: async (id: keyof typeof INDEX_PORTALS) => INDEX_PORTALS[id] ? { ...INDEX_PORTALS[id], active: true } : null };
});
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const filters: [string, unknown][] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.keys.filter(row => filters.every(([column, value]) => row[column] === value)), error: null }).then(resolve),
  };
  return query;
} } }));
import { createPortalIndexKey, listPortalIndexKeys } from "./index-keys.functions";
import { hashIndexKey } from "./index-keys.server";
describe("SuperAdmin key management response safety", () => {
  it("returns no plaintext or digest in the actual list response, including legacy credentials", async () => {
    const key = "hbbc_EXEMPLU_SECRET_FICTIV_012345678901234567890123456789";
    process.env['BAZARULDECASE_INDEX_KEY'] = key;
    state.allowed = true;
    state.keys = [{ id: "managed", key_type: "index", portal: "bazaruldecase", key_hash: hashIndexKey(key), prefix: "hbbc_", last4: key.slice(-4), source: "managed", status: "active", created_at: "2026-11-07", last_used_at: null }];
    const result = await listPortalIndexKeys();
    expect(result).toHaveLength(7);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(hashIndexKey(key));
  });
  it("returns a newly generated key once and only persists its hash and metadata", async () => {
    state.allowed = true; state.inserted = [];
    const result = await createPortalIndexKey({ data: { portal: "bazaruldecase" } });
    expect(result.key).toMatch(/^hbbc_[a-f0-9]{64}$/);
    expect(JSON.stringify(state.inserted)).not.toContain(result.key);
    expect(state.inserted[0]?.key_hash).toBe(hashIndexKey(result.key));
  });
  it("rejects lists and generation for a non-superadmin", async () => {
    state.allowed = false;
    await expect(listPortalIndexKeys()).rejects.toThrow("Acces refuzat");
    await expect(createPortalIndexKey({ data: { portal: "bazaruldecase" } })).rejects.toThrow("Acces refuzat");
    state.allowed = true;
  });
});