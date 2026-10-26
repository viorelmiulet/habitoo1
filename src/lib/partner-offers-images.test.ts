import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), order: vi.fn(), sign: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const fn = { middleware: () => fn, inputValidator: () => fn, handler: (handler: unknown) => handler };
  return fn;
} }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: mocks.from, storage: { from: () => ({ createSignedUrls: mocks.sign }) },
} }));
import { getCollaborationOffer } from "./collaboration.functions";

describe("partner offer detail public photos", () => {
  let imageCount: number;
  beforeEach(() => {
    vi.clearAllMocks();
    imageCount = 8;
    mocks.sign.mockImplementation(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `signed:${path}` })) }));
    mocks.from.mockImplementation((table: string) => {
      let data: unknown = [];
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
        select: (cols: string) => {
          if (table === "profiles") data = { organization_id: "mine" };
          if (table === "organizations") data = cols.startsWith("id,")
            ? [{ id: "partner", name: "Partner", status: "active", collaboration_enabled: true }]
            : { collaboration_enabled: true };
          if (table === "properties") data = [{ id: "offer", organization_id: "partner", title: "HB-1265", features: [], utilities: [] }];
          if (table === "property_images") data = Array.from({ length: imageCount }, (_, i) => ({ property_id: "offer", storage_path: `photo-${i}`, position: i, is_primary: i === 0 }));
          return chain;
        },
        eq: (...args: unknown[]) => { mocks.eq(table, ...args); return chain; },
        order: (...args: unknown[]) => { mocks.order(table, ...args); return chain; },
      };
      for (const method of ["in", "neq", "is", "limit", "maybeSingle"]) chain[method] = () => chain;
      return chain;
    });
  });
  const run = getCollaborationOffer as unknown as (input: { context: { userId: string }; data: { id: string } }) => Promise<{ images: string[] }>;
  it("returns all eight public photos in primary/position order", async () => {
    const offer = await run({ context: { userId: "agent" }, data: { id: "offer" } });
    expect(offer.images).toEqual(Array.from({ length: 8 }, (_, i) => `signed:photo-${i}`));
    expect(mocks.order).toHaveBeenCalledWith("property_images", "position", { ascending: true });
  });
  it("only requests nonconfidential publishable photos before signing", async () => {
    await run({ context: { userId: "agent" }, data: { id: "offer" } });
    expect(mocks.eq).toHaveBeenCalledWith("property_images", "is_confidential", false);
    expect(mocks.eq).toHaveBeenCalledWith("property_images", "include_in_publish", true);
  });
  it("does not truncate detail galleries at twelve photos", async () => {
    imageCount = 15;
    const offer = await run({ context: { userId: "agent" }, data: { id: "offer" } });
    expect(offer.images).toHaveLength(15);
    expect(offer.images[14]).toBe("signed:photo-14");
  });
});