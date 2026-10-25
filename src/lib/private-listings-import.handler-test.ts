import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ copy: vi.fn(), download: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("./private-listing-import.server", () => ({ copyListingPhotos: mocks.copy }));
import { importPrivateListing, importPrivateListingSchema } from "./private-listing-import.functions";
const listingId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const handler = importPrivateListing as unknown as (args: { data: { listingId: string; consent: boolean }; context: unknown }) => Promise<{ propertyId: string; created: boolean; skipped: number }>;
function client(existing = false, created = true) {
  const rpc = vi.fn().mockResolvedValue({ data: { propertyId, created }, error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: null, data: table === "profiles" ? { organization_id: "org", is_active: true } : table === "listings" ? { id: listingId, source: "anuntul", external_id: "original", images: ["a", "b"] } : existing ? { property_id: propertyId } : null }) }; return q;
  });
  return { from, rpc, storage: { from: () => ({ remove }) }, remove };
}
beforeEach(() => { vi.clearAllMocks(); mocks.copy.mockResolvedValue({ paths: ["org/photo1", "org/photo2"], skipped: 0 }); });
describe("private listing import consent and deduplication", () => {
  it("Nu rejects without any read, copy or write", async () => {
    const db = client();
    expect(importPrivateListingSchema.safeParse({ listingId, consent: false }).success).toBe(false);
    await expect(handler({ data: { listingId, consent: false }, context: { supabase: db, userId: "agent" } })).rejects.toThrow("Acordul");
    expect(db.from).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled();
  });
  it("Da copies the whole gallery in order and invokes only the import RPC", async () => {
    const db = client();
    const result = await handler({ data: { listingId, consent: true }, context: { supabase: db, userId: "agent" } });
    expect(mocks.copy).toHaveBeenCalledWith(db, ["a", "b"], "org", expect.any(String));
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("import_private_listing", expect.objectContaining({ _consent: true, _listing_id: listingId, _images: [{ path: "org/photo1" }, { path: "org/photo2" }] }));
    expect(result).toEqual({ propertyId, created: true, skipped: 0 });
  });
  it("second import returns the existing agency property without copying or writing", async () => {
    const db = client(true);
    expect(await handler({ data: { listingId, consent: true }, context: { supabase: db, userId: "agent" } })).toEqual({ propertyId, created: false, skipped: 0 });
    expect(db.rpc).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled();
  });
  it("a concurrent losing attempt cleans up only its own uploaded photos", async () => {
    const db = client(false, false);
    await handler({ data: { listingId, consent: true }, context: { supabase: db, userId: "agent" } });
    expect(db.remove).toHaveBeenCalledWith(["org/photo1", "org/photo2"]);
  });
});