import { describe, expect, it, vi } from "vitest";
import { planStoriaAutoRenewBulk } from "./auto-renew";
import { enqueueStoriaAutoRenewBulk } from "./auto-renew.server";
import { storiaChoiceToOverride } from "@/components/app/StoriaAutoRenewBulkDialog";

const prop = (id: string, assigned_to = "me") => ({ id, assigned_to, archived_at: null, feedEligible: true });
const base = {
  properties: [prop("a"), prop("b"), prop("c"), prop("d", "other")],
  listings: [{ property_id: "a", status: "published", external_id: "X1" }, { property_id: "b", status: "removed", external_id: "X2" }],
  publications: [{ property_id: "a", enabled: true }, { property_id: "b", enabled: true }],
  connectionActivated: true, userId: "me",
};

describe("Storia auto-renew bulk", () => {
  it("counts a mixed selection correctly", () => {
    const plan = planStoriaAutoRenewBulk({ ...base, propertyIds: ["a", "b", "c"], agentOnly: false });
    expect(plan).toEqual({ sendNow: ["a"], saveOnly: ["b", "c"], forbidden: [] });
  });
  it("an agent cannot change another agent's properties", () => {
    const plan = planStoriaAutoRenewBulk({ ...base, propertyIds: ["a", "d"], agentOnly: true });
    expect(plan.forbidden).toEqual(["d"]);
    expect(planStoriaAutoRenewBulk({ ...base, propertyIds: ["d"], agentOnly: false }).forbidden).toEqual([]);
  });
  it("'Revino la setarea agenției' saves null", () => {
    expect(storiaChoiceToOverride("inherit")).toBeNull();
    expect(storiaChoiceToOverride("on")).toBe(true);
    expect(storiaChoiceToOverride("off")).toBe(false);
  });
  it("queues all pairs in one start_portal_contact_updates call", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await enqueueStoriaAutoRenewBulk({ rpc } as any, { organizationId: "o", propertyIds: ["a", "b"], actorId: "me", superadmin: false });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]._pairs.map((p: any) => [p.property_id, p.portal_key])).toEqual([["a", "storia"], ["b", "storia"]]);
  });
});
