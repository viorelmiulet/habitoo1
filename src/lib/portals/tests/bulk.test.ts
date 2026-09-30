import { describe, expect, it, vi } from "vitest";
import { bulkDraftKey, bulkLimitExceeded, bulkSlotProjection, reconcileBulkDraft, toggleBulkPage, isRetryablePortalBulkError, previewBulkSelection } from "@/lib/portals/bulk";
import { processPortalBulkProperty } from "@/lib/portals/bulk.server";

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
  it("previews skipped listings and slot changes for publication", () => {
    expect(previewBulkSelection({ enabled: true, used: 11, selected: [{ enabled: false }, { enabled: true }, { enabled: false }] })).toEqual({
      changed: 2, skipped: 1, before: 11, after: 13,
    });
  });
  it("previews skipped listings and slot changes for withdrawal", () => {
    expect(previewBulkSelection({ enabled: false, used: 11, selected: [{ enabled: true }, { enabled: false }] })).toEqual({
      changed: 1, skipped: 1, before: 11, after: 10,
    });
  });
});

type FakeRow = Record<string, unknown>;
function workerDb(items: FakeRow[]) {
  const jobs: FakeRow[] = [{ id: "job", status: "queued", total: items.length, done: 0, failed: 0 }];
  const from = (table: string) => {
    const rows = table === "portal_bulk_items" ? items : jobs;
    const filters: [string, unknown][] = [];
    let patch: FakeRow | null = null;
    const selected = () => rows.filter((row) => filters.every(([key, value]) => row[key] === value));
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = (key: string, value: unknown) => (filters.push([key, value]), query);
    query.update = (value: FakeRow) => (patch = value, query);
    query.then = (resolve: (value: unknown) => unknown) => { if (patch) selected().forEach((row) => Object.assign(row, patch)); return resolve({ data: selected(), error: null }); };
    return query;
  };
  const rpc = async () => ({ data: items.filter((item) => item.status === "queued").map((item) => ({ ...item, status: "running" })), error: null });
  return { admin: { from, rpc }, jobs, items };
}

describe("portal bulk worker with mocked adapters", () => {
  const base = (id: string) => ({ id, job_id: "job", property_id: "property", portal_key: id, enabled: true, promoted: null, status: "queued", attempts: 0, max_attempts: 3 });
  it("marks a successful mocked portal operation", async () => {
    const db = workerDb([base("portal-ok")]);
    await processPortalBulkProperty(db.admin as never, { jobId: "job", propertyId: "property", organizationId: "org", actorId: "user" }, { apply: vi.fn(async () => [{ portalId: "portal-ok", ok: true, message: "Publicat" }]), pause: async () => {} });
    expect(db.items[0]?.status).toBe("ok");
  });
  it("requeues a temporary failure and does not retry a definitive one", async () => {
    const db = workerDb([base("temporary"), base("definitive")]);
    await processPortalBulkProperty(db.admin as never, { jobId: "job", propertyId: "property", organizationId: "org", actorId: "user" }, { apply: vi.fn(async () => [{ portalId: "temporary", ok: false, code: "RATE_LIMIT", message: "429" }, { portalId: "definitive", ok: false, code: "VALIDATION_ERROR", message: "Date invalide" }]), pause: async () => {} });
    expect(db.items.find((item) => item.portal_key === "temporary")?.status).toBe("queued");
    expect(db.items.find((item) => item.portal_key === "definitive")?.status).toBe("failed");
  });
});
