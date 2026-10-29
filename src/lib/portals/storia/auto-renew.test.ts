import { describe, expect, it, vi } from "vitest";
import { enqueueStoriaAutoRenewUpdate, runStoriaContentUpdateJob } from "./auto-renew.server";
import { storiaAutoRenewVisible } from "./auto-renew";

const input = { organizationId: "org", propertyId: "property", actorId: "agent", superadmin: false };
const job = { organization_id: "org", property_id: "property", requested_by: "agent" };
function db(status: string | null, changes: Record<string, unknown> = {}) {
  const rows: Record<string, unknown> = {
    properties: { status: "active", publish_status: "published", deleted_at: null, archived_at: null },
    portal_listings: status === null ? null : { status, external_id: "SALE:uuid" },
    portal_publications: { enabled: true }, portal_connections: { activated: true }, ...changes,
  };
  const rpc = vi.fn(async () => ({ data: 1, error: null }));
  const admin = { rpc, from: (table: string) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: rows[table], error: null }) };
    return chain;
  } };
  return { admin: admin as unknown as Parameters<typeof enqueueStoriaAutoRenewUpdate>[0], rpc };
}

describe("Storia auto-renew content queue", () => {
  it.each(["published", "updated", "pending"])("queues existing %s adverts through the atomic update queue", async status => {
    const { admin, rpc } = db(status);
    expect(await enqueueStoriaAutoRenewUpdate(admin, input)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("start_portal_contact_updates", {
      _org: "org", _actor: "agent", _superadmin: false,
      _pairs: [{ property_id: "property", portal_key: "storia", next_attempt_at: expect.any(String) }],
    });
  });
  it.each(["expired", "withdrawn", "error", "outdated", "moderated", "removed_by_user", "removed_by_moderator", null])("never queues %s adverts", async status => {
    const { admin, rpc } = db(status);
    expect(await enqueueStoriaAutoRenewUpdate(admin, input)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { portal_publications: { enabled: false } }, { portal_connections: { activated: false } },
    { portal_listings: { status: "published", external_id: null } },
    { properties: { status: "sold", publish_status: "published" } },
    { properties: { status: "active", publish_status: "draft" } },
    { properties: { status: "active", publish_status: "published", archived_at: "2026-10-29" } },
  ])("does not enqueue ineligible property or disabled publication (%j)", async changes => {
    const { admin, rpc } = db("published", changes);
    expect(await enqueueStoriaAutoRenewUpdate(admin, input)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("updates a processing advert with no publication/promotion action", async () => {
    const { admin } = db("pending");
    const execute = vi.fn(async () => ({ ok: true, message: "Accepted" }));
    expect((await runStoriaContentUpdateJob(admin, job, execute)).action).toBe("updated");
    expect(execute).toHaveBeenCalledExactlyOnceWith({ organizationId: "org", propertyId: "property", actorId: "agent", portalId: "storia", action: "update", operationLabel: "update", skipSlotCheck: true });
  });
  it.each(["expired", "withdrawn", "error"])("worker skips adverts that become %s after enqueue", async status => {
    const { admin } = db(status);
    const execute = vi.fn(async () => ({ ok: true }));
    expect((await runStoriaContentUpdateJob(admin, job, execute)).action).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
  });
});