/**
 * Deselectarea unui portal trebuie să RETRAGĂ efectiv oferta de pe portal,
 * indiferent de statusul local, iar un eșec real nu se raportează ca succes.
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

/** Statusul local al listării: dovedim că nu mai decide dacă se apelează portalul. */
let listingStatus = "pending";
let listingExternalId: string | null = "LC-1";
const withdrawCalls: string[] = [];
let withdrawResult: unknown = { ok: true, data: { live: true, detail: null, externalId: "LC-1" } };
const writes: { table: string; op: string; row: unknown }[] = [];

function chain(table: string) {
  const q: Record<string, unknown> = {};
  const listFor = (): unknown[] => {
    if (table === "portal_publications") return [{ portal_key: "lacheie", enabled: true }];
    if (table === "portal_listings")
      return [{ portal: "lacheie", status: listingStatus, external_id: listingExternalId }];
    if (table === "portal_connections")
      return [{ portal: "lacheie", activated: true, status: "connected" }];
    return [];
  };
  const singleFor = (): unknown => {
    if (table === "properties")
      return {
        id: "prop-1",
        publish_status: "published",
        status: "active",
        deleted_at: null,
      };
    if (table === "portal_listings")
      return { id: "l-1", status: listingStatus, external_id: listingExternalId };
    if (table === "portal_connections")
      return {
        portal: "lacheie",
        direction: null,
        authentication_mode: null,
        external_account_id: null,
        portal_credentials_encrypted: null,
        settings: { allow_live: true },
        activated: true,
        status: "connected",
      };
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
  getPortalAdapter: () => ({
    publishListing: async () => ({ ok: true, data: { live: true, detail: null, externalId: "LC-1" } }),
    updateListing: async () => ({ ok: true, data: { live: true, detail: null, externalId: "LC-1" } }),
    withdrawListing: async (_ctx: unknown, ref: { externalId: string | null }) => {
      withdrawCalls.push(ref.externalId ?? "none");
      return withdrawResult;
    },
  }),
}));

const context = {
  userId: "user-1",
  supabase: {
    rpc: async (fn: string) => ({ data: fn === "is_org_admin", error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { organization_id: "org-1" }, error: null }),
        }),
      }),
    }),
  },
};

const propertyId = "11111111-1111-1111-1111-111111111111";

async function deselectViaSelection() {
  const { applyPortalSelectionForOrg } = await import("@/lib/portals.functions");
  return await applyPortalSelectionForOrg({
    organizationId: "org-1",
    superadmin: false,
    actorId: "user-1",
    data: { propertyId, selections: [{ portalId: "lacheie", enabled: false }], syncExisting: false },
  });
}

describe("retragerea la deselectare", () => {
  beforeEach(() => {
    withdrawCalls.length = 0;
    writes.length = 0;
    listingStatus = "pending";
    listingExternalId = "LC-1";
    withdrawResult = { ok: true, data: { live: true, detail: null, externalId: "LC-1" } };
  });

  it("deselectarea din listă retrage efectiv oferta de pe portal", async () => {
    const { setPropertyPortalSelection } = await import("@/lib/portals.functions");
    listingStatus = "published";
    const out = (await (
      setPropertyPortalSelection as unknown as (a: {
        data: unknown;
        context: unknown;
      }) => Promise<{ ok: boolean; attempted: boolean; withdrawn: boolean }>
    )({
      data: { propertyId, portalId: "lacheie", enabled: false },
      context,
    })) as { ok: boolean; attempted: boolean; withdrawn: boolean };

    expect(withdrawCalls).toEqual(["LC-1"]);
    expect(out.attempted).toBe(true);
    expect(out.withdrawn).toBe(true);
    expect(out.ok).toBe(true);
  });

  it("statusul local pending/error nu împiedică apelul către portal", async () => {
    listingStatus = "error";
    const out = await deselectViaSelection();
    expect(withdrawCalls).toEqual(["LC-1"]);
    expect(out.results[0]?.ok).toBe(true);
    expect(out.results[0]?.action).toBe("withdrawn");
  });

  it("404 înseamnă deja retrasă", async () => {
    withdrawResult = {
      ok: false,
      code: "NOT_FOUND",
      message: "Anunțul nu există la portal.",
      httpStatus: 404,
    };
    const out = await deselectViaSelection();
    expect(withdrawCalls).toEqual(["LC-1"]);
    expect(out.results[0]?.ok).toBe(true);
    expect(out.results[0]?.message).toMatch(/deja retrasă/i);
  });

  it("un eșec real este raportat ca eșec, nu ca succes", async () => {
    withdrawResult = {
      ok: false,
      code: "PORTAL_ERROR",
      message: "La Cheie: eroare internă la portal.",
      httpStatus: 500,
    };
    const out = await deselectViaSelection();
    expect(withdrawCalls).toEqual(["LC-1"]);
    expect(out.ok).toBe(false);
    expect(out.results[0]?.ok).toBe(false);
    expect(out.results[0]?.action).toBe("blocked");
    expect(out.results[0]?.message).toMatch(/eroare internă/i);
  });

  it("fără external_id nu se pretinde o retragere de la portal", async () => {
    listingExternalId = null;
    const out = await deselectViaSelection();
    expect(withdrawCalls).toEqual([]);
    expect(out.results[0]?.message).toMatch(/nu a fost niciodată trimisă/i);
  });
});
