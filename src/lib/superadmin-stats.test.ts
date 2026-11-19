import { describe, expect, it } from "vitest";
import { activeByAgent, listingsRatio, visibleOrgs, type StatsListing } from "@/lib/superadmin-stats";
import { assertSuperadminCaller } from "@/lib/superadmin-stats.functions";

const L = (status: string, assigned_to: string | null, deleted = false): StatsListing =>
  ({ status, assigned_to, organization_id: "A", deleted_at: deleted ? "2026-11-01" : null });

describe("SA1 statistici superadmin", () => {
  it("refuză un utilizator care nu e superadmin", async () => {
    const sb = { rpc: async () => ({ data: false, error: null }) };
    await expect(assertSuperadminCaller(sb)).rejects.toThrow(/Acces refuzat/);
    await expect(assertSuperadminCaller({ rpc: async () => ({ data: true, error: null }) })).resolves.toBeUndefined();
  });

  it("agenția A: 3 active + 1 vândut + 1 șters → 3 / 4; agentul X → 2", () => {
    const rows = [L("active", "X"), L("active", "X"), L("active", "Y"), L("sold", "Y"), L("active", "X", true)];
    expect(listingsRatio(rows)).toEqual({ active: 3, total: 4 });
    expect(activeByAgent(rows).get("X")).toBe(2);
  });

  it("agenția demo nu apare implicit", () => {
    const orgs = [{ id: "A", is_demo: false }, { id: "D", is_demo: true }];
    expect(visibleOrgs(orgs, false).map((o) => o.id)).toEqual(["A"]);
    expect(visibleOrgs(orgs, true)).toHaveLength(2);
  });
});
