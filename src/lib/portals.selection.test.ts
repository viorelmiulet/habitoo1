/**
 * Izolarea per portal la publicare: un portal care aruncă o excepție (ex. Storia
 * respinge validarea) NU trebuie să oprească publicarea pe celelalte portaluri.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

/** Server function fără transport: apelăm direct handlerul. */
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

const writes: { table: string; op: string; row: unknown }[] = [];

function chain(table: string) {
  const q: Record<string, unknown> = {};
  const listFor = (): unknown[] => {
    if (table === "portal_publications") {
      return [
        { portal_key: "clickimob", enabled: false },
        { portal_key: "storia", enabled: false },
      ];
    }
    if (table === "portal_listings") return [];
    if (table === "portal_connections") {
      return [
        { portal: "clickimob", activated: true, status: "connected" },
        { portal: "storia", activated: true, status: "connected" },
      ];
    }
    return [];
  };
  const singleFor = (): unknown => {
    if (table === "properties") {
      return { id: "prop-1", publish_status: "published", status: "available", deleted_at: null };
    }
    if (table === "portal_connections") {
      return {
        portal: "x",
        direction: null,
        authentication_mode: null,
        external_account_id: null,
        portal_credentials_encrypted: null,
        settings: { allow_live: true },
        activated: true,
        status: "connected",
      };
    }
    return null;
  };
  const pass = () => q;
  for (const k of ["select", "eq", "order", "limit", "in", "is"]) q[k] = pass;
  q["maybeSingle"] = async () => ({ data: singleFor(), error: null });
  q["insert"] = async (row: unknown) => {
    writes.push({ table, op: "insert", row });
    return { data: null, error: null };
  };
  q["update"] = (row: unknown) => {
    writes.push({ table, op: "update", row });
    return q;
  };
  q["upsert"] = async (row: unknown) => {
    writes.push({ table, op: "upsert", row });
    return { data: null, error: null };
  };
  q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: listFor(), error: null });
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

vi.mock("@/lib/portals/crypto.server", () => ({
  decryptPortalCredential: () => "credential",
  encryptPortalCredential: () => "enc",
}));

vi.mock("@/lib/portals/rate-limit.server", () => ({ portalRateLimited: () => false }));

vi.mock("@/lib/portals/adapters/index.server", () => ({
  getPortalAdapter: (id: string) => {
    if (id === "storia") {
      return {
        publishListing: async () => {
          throw new Error("Storia a respins validarea anunțului.");
        },
        updateListing: async () => {
          throw new Error("Storia a respins validarea anunțului.");
        },
        withdrawListing: async () => {
          throw new Error("Storia a respins validarea anunțului.");
        },
      };
    }
    return {
      publishListing: async () => ({
        ok: true,
        data: { live: true, detail: null, externalId: "CI-1", message: null },
      }),
      updateListing: async () => ({
        ok: true,
        data: { live: true, detail: null, externalId: "CI-1", message: null },
      }),
      withdrawListing: async () => ({ ok: true, data: { live: true, detail: null, externalId: null } }),
    };
  },
}));

const context = {
  userId: "user-1",
  supabase: {
    rpc: async (fn: string) => ({ data: fn === "is_org_admin", error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { organization_id: "org-1" }, error: null }) }),
      }),
    }),
  },
};

describe("applyPropertyPortalSelection", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("continuă publicarea pe celelalte portaluri când unul aruncă o excepție", async () => {
    const { applyPropertyPortalSelection } = await import("@/lib/portals.functions");
    const run = applyPropertyPortalSelection as unknown as (a: {
      data: unknown;
      context: unknown;
    }) => Promise<{ ok: boolean; results: { portalId: string; ok: boolean; message: string | null }[] }>;

    const out = await run({
      data: {
        propertyId: "11111111-1111-1111-1111-111111111111",
        selections: [
          { portalId: "storia", enabled: true },
          { portalId: "clickimob", enabled: true },
        ],
        syncExisting: true,
      },
      context,
    });

    const storia = out.results.find((r) => r.portalId === "storia");
    const clickimob = out.results.find((r) => r.portalId === "clickimob");

    // Ambele portaluri au un rezultat propriu: eșecul unuia nu a oprit bucla.
    expect(storia?.ok).toBe(false);
    expect(storia?.message).toBeTruthy();
    expect(clickimob?.ok).toBe(true);
    expect(out.ok).toBe(false);

    // Starea portalului reușit s-a persistat, în ciuda eșecului celuilalt.
    const listingWrites = writes.filter((w) => w.table === "portal_listings");
    expect(listingWrites.length).toBeGreaterThan(0);
  });
});
