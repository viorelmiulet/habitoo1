import { describe, expect, it, vi } from "vitest";
import { enqueueContactUpdates, runContactUpdateJob } from "./contact-update.server";

function db() {
  const tables: Record<string, unknown[]> = {
    properties: ["moved", "blocked", "same"].map(id => ({ id, status: "active", assigned_to: "new", deleted_at: null })),
    portal_listings: [
      { property_id: "moved", portal: "vdi", status: "published", external_id: "12" },
      { property_id: "moved", portal: "imobiliare_ro", status: "updated", external_id: "HB-12" },
      { property_id: "moved", portal: "properstar", status: "published", external_id: "feed" },
      { property_id: "moved", portal: "romimo", status: "withdrawn", external_id: "14" },
      { property_id: "blocked", portal: "vdi", status: "published", external_id: "13" },
    ],
    portal_publications: ["vdi", "imobiliare_ro", "properstar", "romimo"].map(portal_key => ({ property_id: "moved", portal_key, enabled: true })).concat([{ property_id: "blocked", portal_key: "vdi", enabled: true }]),
    portal_connections: ["vdi", "imobiliare_ro", "properstar", "romimo"].map(portal => ({ portal, activated: true })),
  };
  const rpc = vi.fn(async () => ({ error: null }));
  return { rpc, from: (name: string) => {
    const chain = { select: () => chain, eq: () => chain, is: () => chain,
      maybeSingle: async () => ({ data: tables[name]?.[0] }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: tables[name] ?? [] }),
    }; return chain;
  } };
}
describe("contact refresh queue", () => {
  it("queues only successfully moved active pairs and no feed or withdrawn pair", async () => {
    const admin = db();
    await enqueueContactUpdates(admin, { organizationId: "org", propertyIds: ["moved"], actorId: "admin", superadmin: false });
    const calls = admin.rpc.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls.filter(([name]) => name === "enqueue_portal_contact_update").map(([, args]) => [args._property, args._portal])).toEqual([["moved", "vdi"], ["moved", "imobiliare_ro"]]);
    expect(calls.map(([name]) => name)).toContain("portal_publish_arm");
  });
  it("worker calls update only, with no promotion choices", async () => {
    const admin = db();
    const execute = vi.fn(async () => ({ ok: true }));
    const result = await runContactUpdateJob(admin, { organization_id: "org", property_id: "moved", portal_key: "vdi", requested_by: "admin" }, execute);
    expect(execute).toHaveBeenCalledWith({ organizationId: "org", propertyId: "moved", portalId: "vdi", actorId: "admin", action: "update", operationLabel: "update", skipSlotCheck: true });
    expect(result.action).toBe("updated");
  });
  it("never updates a portal deactivated after enqueue", async () => {
    const admin = db();
    const original = admin.from;
    admin.from = name => {
      const chain = original(name);
      if (name === "portal_connections") chain.maybeSingle = async () => ({ data: { activated: false } });
      return chain;
    };
    const execute = vi.fn(async () => ({ ok: true }));
    const result = await runContactUpdateJob(admin, { organization_id: "org", property_id: "moved", portal_key: "vdi", requested_by: "admin" }, execute);
    expect(result.action).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
  });
});