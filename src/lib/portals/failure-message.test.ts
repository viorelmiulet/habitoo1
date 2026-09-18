/**
 * Motivul EXACT al unui eșec de publicare (limită de locuri, validare,
 * eroarea portalului) trebuie să rămână salvat pe ofertă, nu doar în
 * notificarea temporară — altfel după reîmprospătare agentul vede doar o
 * stare generică, fără motiv.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const build = () => {
    const self: Record<string, unknown> = {};
    self["middleware"] = () => self;
    self["inputValidator"] = (fn: (i: unknown) => unknown) => {
      self["_validator"] = fn;
      return self;
    };
    self["handler"] =
      (fn: (a: { data: unknown; context: unknown }) => unknown) =>
      (args: { data: unknown; context: unknown }) =>
        fn({
          data: (self["_validator"] as (i: unknown) => unknown)(args.data),
          context: args.context,
        });
    return self;
  };
  return {
    createServerFn: () => build(),
    createMiddleware: () => ({ middleware: () => ({ server: () => ({}) }), server: () => ({}) }),
  };
});

vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));

const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];

function chain(table: string) {
  const q: Record<string, unknown> = {};
  const singleFor = (): unknown => {
    if (table === "properties") {
      return {
        id: "prop-1",
        publish_status: "published",
        status: "active",
        deleted_at: null,
      };
    }
    if (table === "portal_listings")
      return { id: "l-1", status: "pending", external_id: null };
    return null;
  };
  const pass = () => q;
  for (const k of ["select", "eq", "order", "limit", "in", "is"]) q[k] = pass;
  q["maybeSingle"] = async () => ({ data: singleFor(), error: null });
  q["insert"] = async (row: Record<string, unknown>) => {
    writes.push({ table, op: "insert", row });
    return { data: null, error: null };
  };
  q["update"] = (row: Record<string, unknown>) => {
    writes.push({ table, op: "update", row });
    return q;
  };
  q["upsert"] = async (row: Record<string, unknown>) => {
    writes.push({ table, op: "upsert", row });
    return { data: null, error: null };
  };
  q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

vi.mock("@/lib/portals/rate-limit.server", () => ({ portalRateLimited: () => false }));

vi.mock("@/lib/site-feed/mapper", () => ({ isPropertyFeedEligible: () => true }));

vi.mock("@/lib/portals/requirements.server", () => ({
  portalRequirementReport: async () => ({ ok: true }),
}));

vi.mock("@/lib/portals/slots.server", () => ({
  ensurePortalSlotAvailable: async () => ({
    ok: false,
    message:
      "La Cheie: agentul Ion Popescu a atins limita de locuri de publicare (3/3). Eliberează un loc sau mărește alocarea.",
  }),
}));

describe("motivul exact al eșecului de publicare", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("limita de locuri se salvează pe ofertă cu mesajul complet, nu doar în toast", async () => {
    const { executeListingAction } = await import("@/lib/portals.functions");

    const result = await executeListingAction({
      organizationId: "org-1",
      actorId: "user-1",
      portalId: "lacheie",
      propertyId: "prop-1",
      action: "publish",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("3/3");

    // Motivul este persistat pe ambele rânduri citite de matricea din interfață.
    const pub = writes.find(
      (w) => w.table === "portal_publications" && w.op === "update" && w.row["last_error"],
    );
    expect(pub?.row["last_error"]).toContain("limita de locuri");
    expect(pub?.row["status"]).toBe("error");

    const listing = writes.find(
      (w) => w.table === "portal_listings" && w.op === "update" && w.row["last_error"],
    );
    expect(listing?.row["last_error"]).toContain("limita de locuri");
    expect(listing?.row["status"]).toBe("error");

    // Și jurnalul de operațiuni primește același motiv exact.
    const log = writes.find((w) => w.table === "portal_operation_logs");
    expect(String(log?.row["error_message"] ?? "")).toContain("3/3");
  });
});
