import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOrg: vi.fn(),
  assertAccess: vi.fn(),
  buildContext: vi.fn(),
  available: vi.fn(),
  listingReads: 0,
  listing: null as null | { status: string; external_id: string },
}));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate: (value: unknown) => unknown = (value) => value;
  const builder = {
    middleware: () => builder,
    inputValidator: (fn: (value: unknown) => unknown) => { validate = fn; return builder; },
    handler: (fn: (args: unknown) => unknown) => async (input: { data: unknown }) => fn({ data: validate(input.data), context: { userId: "u1" } }),
  };
  return builder;
} }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/lib/portals.functions", () => ({
  resolvePublishingOrg: mocks.resolveOrg,
  assertPortalPropertyAccess: mocks.assertAccess,
  buildContext: mocks.buildContext,
  logOperation: vi.fn(),
}));
vi.mock("@/lib/portals/registry", () => ({ getPortalDefinition: () => ({ id: "imopedia" }) }));
vi.mock("@/lib/portals/adapters/imopedia.server", () => ({ imopediaBoostAvailable: mocks.available, imopediaSaveBoost: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  mocks.listingReads += 1;
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: mocks.listing }),
  };
  return query;
} } }));

import { getImopediaBoostInfo } from "./boost.functions";

let sequence = 0;
let organizationId = "";
const propertyId = "00000000-0000-4000-8000-000000000099";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listingReads = 0;
  mocks.listing = { status: "published", external_id: "123" };
  sequence += 1;
  organizationId = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  mocks.resolveOrg.mockImplementation(async (_context: unknown, requested?: string) => ({ organizationId: requested ?? organizationId, agentOnly: false }));
  mocks.buildContext.mockResolvedValue({ ctx: { organizationId } });
  mocks.available.mockResolvedValue({ ok: true, data: { available: 7 } });
});

it("citește pachetul la nivel de agenție fără verificarea unei proprietăți", async () => {
  const result = await getImopediaBoostInfo({ data: { organizationId } });
  expect(result).toEqual({ published: true, available: 7, error: null });
  expect(mocks.assertAccess).not.toHaveBeenCalled();
  expect(mocks.listingReads).toBe(0);
  expect(mocks.available).toHaveBeenCalledTimes(1);
});

it("citirea agenției și cea a ofertei folosesc același cache", async () => {
  await getImopediaBoostInfo({ data: { organizationId } });
  const result = await getImopediaBoostInfo({ data: { organizationId, propertyId } });
  expect(result).toEqual({ published: true, available: 7, error: null });
  expect(mocks.assertAccess).toHaveBeenCalledTimes(1);
  expect(mocks.listingReads).toBe(1);
  expect(mocks.available).toHaveBeenCalledTimes(1);
});

it("oferta nepublicată păstrează comportamentul anterior și nu citește pachetul", async () => {
  mocks.listing = null;
  const result = await getImopediaBoostInfo({ data: { organizationId, propertyId } });
  expect(result).toEqual({ published: false, available: null, error: null });
  expect(mocks.available).not.toHaveBeenCalled();
});

it("motivul refuzului ajunge nemodificat în rândul de eroare", async () => {
  mocks.available.mockResolvedValue({ ok: false, message: "Sesiune refuzată" });
  const result = await getImopediaBoostInfo({ data: { organizationId } });
  expect(result).toEqual({ published: true, available: null, error: "Sesiune refuzată" });
});
