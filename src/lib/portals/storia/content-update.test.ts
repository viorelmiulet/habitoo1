import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(), update: vi.fn(), create: vi.fn(), activate: vi.fn(), build: vi.fn(),
}));
vi.mock("./oauth.server", () => ({
  storiaAppConfigured: () => true, loadStoriaTokens: async () => ({}),
  readStoriaOAuthMeta: () => null, olxAuthorizedRequest: vi.fn(),
}));
vi.mock("./payload.server", () => ({ buildStoriaPayload: mocks.build }));
vi.mock("./adverts.server", async importOriginal => ({
  ...await importOriginal<typeof import("./adverts.server")>(),
  readAdvertMeta: mocks.read, updateAdvert: mocks.update, createAdvert: mocks.create,
  activateAdvert: mocks.activate,
}));
import { storiaAdapter } from "../adapters/storia.server";
import type { PortalContext } from "../adapter";
const ctx = { organizationId: "org", allowLiveRequests: true } as PortalContext;
const ref = { propertyId: "property", externalId: "SALE:sale-id|RENT:rent-id" };
const advert = { title: "Apartament", description: "Descriere completă", auto_extend: false, images: [{ url: "https://example.test/image.jpg" }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.build.mockResolvedValue({ ok: true, warnings: [], listings: [{ transaction: "sale", advert }, { transaction: "rent", advert }] });
  mocks.update.mockResolvedValue("updated");
});
describe("Storia content-only PUT", () => {
  it.each(["active", "new", "blocked", "unpaid"])("sends the full explicit payload for %s without activating or creating", async code => {
    mocks.read.mockResolvedValue({ code, url: null });
    expect((await storiaAdapter.updateListing(ctx, ref)).ok).toBe(true);
    expect(mocks.update.mock.calls).toEqual([["org", "sale-id", advert], ["org", "rent-id", advert]]);
    expect(mocks.activate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["outdated", "removed_by_user", "removed_by_parent_ad", "moderated", "removed_by_moderator", null])("never PUTs, activates or recreates a remote %s advert", async code => {
    mocks.read.mockResolvedValue({ code, url: null });
    await storiaAdapter.updateListing(ctx, ref);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.activate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("only updates the active transaction when the other expired", async () => {
    mocks.read.mockImplementation(async (_org, uuid) => ({ code: uuid === "sale-id" ? "active" : "outdated", url: null }));
    await storiaAdapter.updateListing(ctx, ref);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("org", "sale-id", advert);
    expect(mocks.activate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not create absent adverts or recreate a PUT 404", async () => {
    await storiaAdapter.updateListing(ctx, { ...ref, externalId: null });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({ code: "active", url: null });
    mocks.update.mockResolvedValue("missing");
    await storiaAdapter.updateListing(ctx, ref);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.activate).not.toHaveBeenCalled();
  });
});