import { describe, expect, it } from "vitest";
import { canConfirmDeletion, deletePlatformUserInput, groupDeletionDestinations } from "./user-deletion";
import { validateDeletionRequest, type DeletionStore } from "./account-deletion.server";

const u = (id: string, org: string | null, extra: Partial<{ roles: string[]; is_active: boolean }> = {}) => ({
  id, full_name: `User ${id}`, is_active: extra.is_active ?? true, organization_id: org, organization_name: org ? `Org ${org}` : null, roles: extra.roles ?? ["agent"],
});

describe("dialog ștergere utilizator", () => {
  it("fără date → doar confirmare", () => {
    expect(canConfirmDeletion({ workload: { properties: 0, leads: 0 }, choice: null, destinationId: null })).toBe(true);
  });
  it("cu date → inactiv până la alegere completă", () => {
    const w = { properties: 2 };
    expect(canConfirmDeletion({ workload: w, choice: null, destinationId: null })).toBe(false);
    expect(canConfirmDeletion({ workload: w, choice: "reassign", destinationId: null })).toBe(false);
    expect(canConfirmDeletion({ workload: w, choice: "reassign", destinationId: "x" })).toBe(true);
    expect(canConfirmDeletion({ workload: w, choice: "delete", destinationId: null })).toBe(true);
    expect(canConfirmDeletion({ workload: null, choice: "delete", destinationId: null })).toBe(false);
  });
  it("select grupat pe agenție, fără superadmini, inactivi sau cel șters", () => {
    const groups = groupDeletionDestinations([u("a", "1"), u("b", "2"), u("c", "1"), u("s", "1", { roles: ["superadmin"] }), u("i", "2", { is_active: false }), u("z", null)], "a");
    expect(groups.map((g) => [g.organizationId, g.users.map((x) => x.id)])).toEqual([["1", ["c"]], ["2", ["b"]]]);
  });
  it("serverul nu mai cere numele", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(deletePlatformUserInput.parse({ userId: id, reassignToUserId: null })).toEqual({ userId: id, reassignToUserId: null });
  });
  it("destinație fără locuri în aceeași agenție → jobul nu pornește", async () => {
    const profiles: Record<string, any> = {
      actor: { id: "actor", organization_id: null, is_active: true, full_name: "Admin", avatar_url: null },
      t: { id: "t", organization_id: "o", is_active: true, full_name: "Ion Pop", avatar_url: null },
      d: { id: "d", organization_id: "o", is_active: true, full_name: "Ana Vlad", avatar_url: null },
    };
    let inserted = false;
    const store = {
      getProfile: async (id: string) => profiles[id] ?? null,
      isSuperadmin: async () => false,
      hasActiveJob: async () => false,
      insertJob: async () => { inserted = true; return "j"; },
      sameOrgSlotConflicts: async () => ["Publi24.ro + Romimo.ro"],
    } as unknown as DeletionStore;
    await expect(validateDeletionRequest(store, { actorId: "actor", kind: "user", targetId: "t", mode: "reassign", reassignToUserId: "d" }))
      .rejects.toThrow("Ana Vlad nu are locuri libere pe: Publi24.ro + Romimo.ro. Eliberează locuri sau mărește limita.");
    expect(inserted).toBe(false);
  });
});
