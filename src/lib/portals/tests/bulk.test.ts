import { describe, expect, it, vi } from "vitest";
import { bulkDraftKey, bulkLimitExceeded, bulkSlotProjection, reconcileBulkDraft, toggleBulkPage, isRetryablePortalBulkError } from "@/lib/portals/bulk";

describe("portal bulk changes", () => {
  it("removes a reverted checkbox change", () => {
    const initial = { enabled: true, promoted: false };
    let drafts = reconcileBulkDraft({}, initial, { propertyId: "p", portalId: "x", enabled: false, promoted: false });
    drafts = reconcileBulkDraft(drafts, initial, { propertyId: "p", portalId: "x", enabled: true, promoted: false });
    expect(drafts).toEqual({});
  });
  it("toggles every eligible cell on the current page", () => {
    const cells = [{ propertyId: "a", enabled: false, promoted: false, eligible: true }, { propertyId: "b", enabled: false, promoted: false, eligible: false }];
    const drafts = toggleBulkPage({ drafts: {}, portalId: "x", cells });
    expect(drafts[bulkDraftKey("a", "x")]?.enabled).toBe(true);
    expect(drafts[bulkDraftKey("b", "x")]).toBeUndefined();
  });
  it("blocks only a projected total above the slot limit", () => {
    const drafts = { [bulkDraftKey("a", "x")]: { propertyId: "a", portalId: "x", enabled: true, promoted: false } };
    const projected = bulkSlotProjection(2, "x", drafts, { [bulkDraftKey("a", "x")]: { enabled: false, promoted: false } });
    expect(projected).toBe(3);
    expect(bulkLimitExceeded(2, 2, projected)).toBe(true);
  });
  it("never keeps promotion when publication is unchecked", () => {
    const drafts = reconcileBulkDraft({}, { enabled: true, promoted: true }, { propertyId: "p", portalId: "x", enabled: false, promoted: true });
    expect(drafts[bulkDraftKey("p", "x")]?.promoted).toBe(false);
  });
  it("classifies transient failures for retry", () => {
    expect(isRetryablePortalBulkError({ httpStatus: 503 })).toBe(true);
    expect(isRetryablePortalBulkError({ code: "VALIDATION_ERROR" })).toBe(false);
  });
});
