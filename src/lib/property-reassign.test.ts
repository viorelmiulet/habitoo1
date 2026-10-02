import { describe, expect, it } from "vitest";
import {
  REASSIGN_ADMIN_ONLY,
  reassignPropertiesCore,
  type ReassignPorts,
  type ReassignProperty,
  type ReassignTarget,
} from "@/lib/property-reassign.server";
import { runReassignBatches } from "@/components/app/ReassignPropertiesDialog";

const ORG = "org-1";
const prop = (id: string, over: Partial<ReassignProperty> = {}): ReassignProperty => ({
  id,
  organization_id: ORG,
  assigned_to: "agent-a",
  reference: `HB-${id}`,
  deleted_at: null,
  ...over,
});
const target = (over: Partial<ReassignTarget> = {}): ReassignTarget => ({
  id: "agent-b",
  organization_id: ORG,
  full_name: "Ion B",
  email: null,
  phone: "0722123456",
  is_active: true,
  roles: ["agent"],
  hasActiveDeletionJob: false,
  ...over,
});

function ports(opts: {
  superadmin?: boolean;
  adminOrgs?: string[];
  props: ReassignProperty[];
  target?: ReassignTarget | null;
  blockIds?: string[];
}) {
  const updates: string[] = [];
  const audits: unknown[] = [];
  const p: ReassignPorts = {
    callerId: "admin-1",
    isSuperadmin: async () => opts.superadmin ?? false,
    adminOrgIds: async () => opts.adminOrgs ?? [ORG],
    loadProperties: async (ids) => opts.props.filter((x) => ids.includes(x.id)),
    loadTarget: async () => (opts.target === undefined ? target() : opts.target),
    updateAssigned: async (id) => {
      if (opts.blockIds?.includes(id)) {
        return { error: "Agentul nu are locuri libere de publicare pe: lacheie" };
      }
      updates.push(id);
      return { error: null };
    },
    audit: async (row) => {
      audits.push(row);
    },
    portalName: (k) => (k === "lacheie" ? "La Cheie" : k),
  };
  return { p, updates, audits };
}

describe("realocarea anunțurilor", () => {
  it("refuză rolul nepermis", async () => {
    const { p } = ports({ adminOrgs: [], props: [prop("1")] });
    await expect(reassignPropertiesCore(p, { propertyIds: ["1"], toUserId: "agent-b" })).rejects.toThrow(
      REASSIGN_ADMIN_ONLY,
    );
  });

  it("refuză anunț din altă agenție", async () => {
    const { p, updates } = ports({ props: [prop("1", { organization_id: "org-2" })] });
    await expect(reassignPropertiesCore(p, { propertyIds: ["1"], toUserId: "agent-b" })).rejects.toThrow(
      /altei agenții/,
    );
    expect(updates).toEqual([]);
  });

  it("refuză anunț șters", async () => {
    const { p } = ports({ props: [prop("1", { deleted_at: "2026-01-01" })] });
    await expect(reassignPropertiesCore(p, { propertyIds: ["1"], toUserId: "agent-b" })).rejects.toThrow();
  });

  it("refuză destinatar din altă agenție", async () => {
    const { p } = ports({ props: [prop("1")], target: target({ organization_id: "org-2" }) });
    await expect(reassignPropertiesCore(p, { propertyIds: ["1"], toUserId: "agent-b" })).rejects.toThrow(
      /nu face parte/,
    );
  });

  it("refuză destinatar inactiv", async () => {
    const { p } = ports({ props: [prop("1")], target: target({ is_active: false }) });
    await expect(reassignPropertiesCore(p, { propertyIds: ["1"], toUserId: "agent-b" })).rejects.toThrow(
      /activ/,
    );
  });

  it("raportează blocajul de locuri în română, cu anunțul blocat", async () => {
    const { p } = ports({ props: [prop("1"), prop("2")], blockIds: ["2"] });
    const res = await reassignPropertiesCore(p, { propertyIds: ["1", "2"], toUserId: "agent-b" });
    expect(res.moved).toBe(1);
    expect(res.blocked).toHaveLength(1);
    expect(res.blocked[0]!.reference).toBe("HB-2");
    expect(res.blocked[0]!.message).toContain("La Cheie");
  });

  it("mută, sare anunțurile care au deja agentul și scrie în audit", async () => {
    const { p, updates, audits } = ports({
      props: [prop("1"), prop("2", { assigned_to: "agent-b" })],
    });
    const res = await reassignPropertiesCore(p, { propertyIds: ["1", "2"], toUserId: "agent-b" });
    expect(res).toMatchObject({ moved: 1, skipped: 1, blocked: [], phoneWarning: null });
    expect(updates).toEqual(["1"]);
    expect(JSON.stringify(audits)).toContain("agent-a");
    expect(JSON.stringify(audits)).toContain("property.reassigned");
  });

  it("avertizează când noul agent nu are telefon, fără a bloca", async () => {
    const { p } = ports({ props: [prop("1")], target: target({ phone: null }) });
    const res = await reassignPropertiesCore(p, { propertyIds: ["1"], toUserId: "agent-b" });
    expect(res.moved).toBe(1);
    expect(res.phoneWarning).toContain("telefon");
  });

  it("mută în masă toate anunțurile unui utilizator, în loturi", async () => {
    const all = Array.from({ length: 120 }, (_, i) => prop(String(i)));
    const { p, updates } = ports({ props: all });
    let calls = 0;
    const res = await runReassignBatches(
      all.map((x) => x.id),
      "agent-b",
      async ({ data }) => {
        calls += 1;
        return reassignPropertiesCore(p, data);
      },
    );
    expect(calls).toBe(3);
    expect(res.moved).toBe(120);
    expect(updates).toHaveLength(120);
  });
});
