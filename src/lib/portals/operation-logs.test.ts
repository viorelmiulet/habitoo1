import { describe, expect, it, vi } from "vitest";
import { MASK, maskSecrets, periodStart, portalLogsFilterSchema } from "./operation-logs";
import { queryPortalLogs } from "@/lib/portal-logs.server";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

function fakeDb(rows: Record<string, unknown>[] = []) {
  const calls: Array<[string, string, unknown]> = [];
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "in", "ilike", "order", "limit", "range"]) {
      b[m] = (...a: unknown[]) => {
        calls.push([table, m, a]);
        return b;
      };
    }
    b.then = (res: (v: unknown) => void) =>
      res(
        table === "portal_operation_logs"
          ? { data: rows, count: rows.length, error: null }
          : table === "properties"
            ? { data: [{ id: "p1", reference: "HB-1" }] }
            : { data: [{ id: "o1", name: "Agenția A" }] },
      );
    return b;
  };
  return { db: { from: (t: string) => make(t) }, calls };
}

describe("jurnal portaluri", () => {
  it("refuză accesul non-superadmin", async () => {
    const { assertSuperadmin, PORTAL_LOGS_DENIED } = await import("@/lib/portal-logs.functions");
    const ctx = (v: unknown) => ({ supabase: { rpc: async () => ({ data: v, error: null }) } });
    await expect(assertSuperadmin(ctx(false))).rejects.toThrow(PORTAL_LOGS_DENIED);
    await expect(assertSuperadmin(ctx(true))).resolves.toBeUndefined();
  });

  it("aplică filtrele și paginarea de 50", async () => {
    const { db, calls } = fakeDb();
    const now = new Date("2026-10-02T15:00:00Z");
    await queryPortalLogs(db, portalLogsFilterSchema.parse({
      page: 3, organizationId: "11111111-1111-4111-8111-111111111111", portal: "storia",
      operation: "publish", status: "error", period: "7d", reference: "HB-1",
    }), now);
    const log = calls.filter((c) => c[0] === "portal_operation_logs");
    expect(log).toContainEqual(["portal_operation_logs", "eq", ["organization_id", "11111111-1111-4111-8111-111111111111"]]);
    expect(log).toContainEqual(["portal_operation_logs", "eq", ["portal", "storia"]]);
    expect(log).toContainEqual(["portal_operation_logs", "eq", ["operation", "publish"]]);
    expect(log).toContainEqual(["portal_operation_logs", "eq", ["success", false]]);
    expect(log).toContainEqual(["portal_operation_logs", "gte", ["created_at", "2026-09-25T15:00:00.000Z"]]);
    expect(log).toContainEqual(["portal_operation_logs", "in", ["property_id", ["p1"]]]);
    expect(log).toContainEqual(["portal_operation_logs", "range", [100, 149]]);
    expect(periodStart("today", now)).toBe("2026-10-02T00:00:00.000Z");
  });

  it("maschează cheile, tokenurile și antetele de autorizare", async () => {
    const masked = maskSecrets({
      headers: { Authorization: "Bearer abc", "X-Api-Key": "k" },
      access_token: "t", nested: [{ password: "p" }],
      message: "failed with Bearer abc.def-123 for listing",
      ok: "listing 42",
    }) as Record<string, any>;
    expect(masked.headers.Authorization).toBe(MASK);
    expect(masked.headers["X-Api-Key"]).toBe(MASK);
    expect(masked.access_token).toBe(MASK);
    expect(masked.nested[0].password).toBe(MASK);
    expect(masked.message).not.toContain("abc");
    expect(masked.ok).toBe("listing 42");

    const { db } = fakeDb([{ id: "l1", organization_id: "o1", portal: "storia", operation: "publish",
      success: true, property_id: "p1", created_at: "x", portal_response: { token: "secret" } }]);
    const res = await queryPortalLogs(db, portalLogsFilterSchema.parse({}));
    expect(res.rows[0]!.portalResponse).toEqual({ token: MASK });
    expect(res.rows[0]!.organizationName).toBe("Agenția A");
  });
});
