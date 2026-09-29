/**
 * Properstar (fără credențiale): activarea setează `status = ready`, iar bifarea
 * pe o proprietate a unei agenții activate nu mai e blocată. Fără date reale.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const build = () => {
    const self: Record<string, unknown> = {};
    self["middleware"] = () => self;
    self["inputValidator"] = () => self;
    self["handler"] = (fn: unknown) => fn;
    return self;
  };
  return {
    createServerFn: () => build(),
    createMiddleware: () => ({ middleware: () => ({ server: () => ({}) }), server: () => ({}) }),
  };
});
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/lib/portals/rate-limit.server", () => ({ portalRateLimited: () => false }));

const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
const tableData: Record<string, unknown[]> = {
  portal_connections: [{ portal: "properstar", status: "ready", activated: true, settings: {} }],
  properties: [{ id: "prop-1" }],
};

function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in", "is", "neq", "not"]) q[k] = () => q;
  const rows = () => tableData[table] ?? [];
  q["maybeSingle"] = async () => ({ data: table === "properties" ? rows()[0] : null, error: null });
  q["single"] = q["maybeSingle"];
  for (const op of ["insert", "update", "upsert", "delete"]) {
    q[op] = (row: Record<string, unknown>) => {
      writes.push({ table, op, row });
      return q;
    };
  }
  q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

const ORG = "11111111-1111-4111-8111-111111111111";

describe("Properstar activat → utilizabil", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("activarea setează ready, dezactivarea not_configured", async () => {
    const { applyPortalActivationForOrg } = await import("@/lib/portals.functions");
    await applyPortalActivationForOrg({ organizationId: ORG, portalId: "properstar", activated: true, actorId: "u" });
    await applyPortalActivationForOrg({ organizationId: ORG, portalId: "properstar", activated: false, actorId: "u" });
    const ups = writes.filter((w) => w.table === "portal_connections" && w.op === "upsert");
    expect(ups.map((u) => u.row["status"])).toEqual(["ready", "not_configured"]);
  });

  it("bifarea Properstar nu e blocată fără cheie Habitoo", async () => {
    const { applyPortalSelectionForOrg } = await import("@/lib/portals.functions");
    const res = await applyPortalSelectionForOrg({
      organizationId: ORG,
      superadmin: false,
      actorId: "u",
      data: { propertyId: "22222222-2222-4222-8222-222222222222", selections: [{ portalId: "properstar", enabled: true }] } as never,
    });
    const r = res.results.find((x) => x.portalId === "properstar");
    expect(r?.action).not.toBe("blocked");
    expect(r?.message ?? "").not.toContain("nu este încă pregătit");
  });
});
