/** Cronul de pachet ignoră anunțurile retrase — doar mock-uri. */
import { describe, expect, it, vi } from "vitest";

const filters: unknown[][] = [];
const q: Record<string, unknown> = {};
for (const m of ["select", "eq", "not", "limit", "update"]) q[m] = (...a: unknown[]) => (filters.push([m, ...a]), q);
q["in"] = (...a: unknown[]) => (filters.push(["in", ...a]), q);
q["then"] = (r: (v: unknown) => unknown) => r({ data: [], error: null });
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => q, rpc: async () => ({}) } }));
vi.mock("@/lib/portals/olx/taxonomy.server", () => ({ loadOlxTaxonomy: async () => ({}) }));

describe("cron OLX", () => {
  it("citește doar pending și needs_packet, niciodată withdrawn", async () => {
    const { pollOlxPendingListings } = await import("../adapters/olx-direct.server");
    const stats = await pollOlxPendingListings();
    const statusFilter = filters.find((f) => f[0] === "in" && f[1] === "status")!;
    expect(statusFilter[2]).toEqual(["pending", "needs_packet"]);
    expect(stats.checked).toBe(0);
  });
});
