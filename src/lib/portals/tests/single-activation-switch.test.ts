/**
 * Un singur comutator de activare: „Activat pentru agenție" pornește și
 * trimiterile reale (`settings.allow_live`), iar dezactivarea le oprește. Nu
 * există stare în care portalul e activat, dar nu trimite.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { notifyPropertyChanged } from "@/lib/portals/clickimob";

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
vi.mock("@/lib/portals/crypto.server", () => ({
  decryptPortalCredential: () => "credential",
  encryptPortalCredential: () => "enc",
}));
vi.mock("@/lib/portals/rate-limit.server", () => ({ portalRateLimited: () => false }));

const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];

function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in", "is"]) q[k] = () => q;
  q["maybeSingle"] = async () => ({
    data:
      table === "portal_connections"
        ? { settings: { endpoint_url: "https://example.invalid" }, activated: false }
        : null,
    error: null,
  });
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

const ORG = "11111111-1111-4111-8111-111111111111";

async function toggle(activated: boolean) {
  const { applyPortalActivationForOrg } = await import("@/lib/portals.functions");
  await applyPortalActivationForOrg({
    organizationId: ORG,
    portalId: "clickimob",
    activated,
    actorId: "user-1",
  });
  const upserts = writes.filter((w) => w.table === "portal_connections" && w.op === "upsert");
  // Un singur apel de scriere pentru ambele stări.
  expect(upserts).toHaveLength(1);
  return upserts[0]!.row;
}


describe("un singur comutator de activare a portalului", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("activarea setează activated și allow_live într-un singur apel", async () => {
    const row = await toggle(true);
    expect(row["activated"]).toBe(true);
    expect((row["settings"] as Record<string, unknown>)["allow_live"]).toBe(true);
    // Setările existente nu se pierd.
    expect((row["settings"] as Record<string, unknown>)["endpoint_url"]).toBe(
      "https://example.invalid",
    );
  });

  it("dezactivarea oprește ambele", async () => {
    const row = await toggle(false);
    expect(row["activated"]).toBe(false);
    expect((row["settings"] as Record<string, unknown>)["allow_live"]).toBe(false);
  });

  it("nu mai există comutator de trimiteri reale în interfață", () => {
    const card = readFileSync("src/components/superadmin/PortalsCard.tsx", "utf8");
    expect(card).not.toContain("Trimiteri reale");
    expect(card).not.toContain("allowLiveRequests");
  });

  it("salvarea configurării nu mai acceptă un comutator separat", () => {
    const source = readFileSync("src/lib/portals.functions.ts", "utf8");
    expect(source).not.toContain("allowLiveRequests: z.boolean()");
  });

  it("adaptorul nu trimite când portalul nu este activat", async () => {
    const config = { webhookUrl: "https://portal.invalid/hook", secret: "s" } as never;
    const result = await notifyPropertyChanged({
      config,
      propertyId: "prop-1",
      enabled: true,
      allowLiveRequests: false,
    });
    expect(result.sent).toBe(false);
  });
});
