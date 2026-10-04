import { describe, expect, it } from "vitest";
import { notifyPortalFailure } from "./failure-notification.server";

function fakeAdmin() {
  const notifications = new Map<string, Record<string, unknown>>();
  const admin = { from(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const rows: Record<string, unknown>[] = table === "properties"
      ? [{ id: "p1", organization_id: "org1", title: "Apartament luminos", assigned_to: "agent1" }]
      : table === "user_roles"
        ? [{ organization_id: "org1", user_id: "admin1", role: "agency_admin" }, { organization_id: "org1", user_id: "admin2", role: "agency_admin" }, { organization_id: "other", user_id: "stranger", role: "agency_admin" }]
        : table === "profiles"
          ? [{ id: "agent1", organization_id: "org1" }]
          : [];
    const query = {
      select: (_: string) => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      maybeSingle: async () => ({ data: rows.find(row => filters.every(f => f(row))) ?? null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows.filter(row => filters.every(f => f(row))) }),
      upsert: async (row: Record<string, unknown>) => { notifications.set(String(row.id), row); return { error: null }; },
    };
    return query;
  } };
  return { admin, notifications };
}

describe("portal failure notifications", () => {
  it("notifies only the assigned agent and agency admins once per failure, with a friendly title", async () => {
    const { admin, notifications } = fakeAdmin();
    const input = { organizationId: "org1", propertyId: "p1", portalKey: "storia", portalName: "Storia", error: "401 API token=private" };
    await notifyPortalFailure(admin, input);
    await notifyPortalFailure(admin, input);
    expect(notifications.size).toBe(3);
    expect([...notifications.values()].map(row => row.user_id).sort()).toEqual(["admin1", "admin2", "agent1"]);
    expect([...notifications.values()].every(row => row.title === "Publicarea pe Storia a eșuat pentru Apartament luminos" && row.link === "/app/properties/p1?tab=publishing" && !JSON.stringify(row).includes("private"))).toBe(true);
    await notifyPortalFailure(admin, { ...input, error: "other error" });
    expect(notifications.size).toBe(6);
  });

  it("does not scan historical errors or notify another agency", async () => {
    const { admin, notifications } = fakeAdmin();
    expect(notifications.size).toBe(0);
    await notifyPortalFailure(admin, { organizationId: "other", propertyId: "p1", portalKey: "storia", portalName: "Storia", error: "failure" });
    expect(notifications.size).toBe(0);
  });
});