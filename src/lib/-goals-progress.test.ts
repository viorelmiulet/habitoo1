import { describe, expect, it } from "vitest";
import { goalPercent, goalRealized } from "@/lib/goals-progress";

const data = {
  properties: [{ created_at: "2026-11-03T10:00:00", assigned_to: "a" }, { created_at: "2026-10-30T10:00:00", assigned_to: "a" }],
  leads: [
    { created_at: "2026-11-02T10:00:00", assigned_to: "a", stage: "won", value: 1500 },
    { created_at: "2026-11-04T10:00:00", assigned_to: "b", stage: "won", value: 900 },
    { created_at: "2026-11-05T10:00:00", assigned_to: "a", stage: "new", value: 0 },
  ],
  activities: [{ starts_at: "2026-11-06T09:00:00", assigned_to: "a", kind: "viewing" }, { starts_at: "2026-11-06T09:00:00", assigned_to: "a", kind: "call" }],
};

describe("progresul obiectivelor", () => {
  it("numără doar luna și agentul obiectivului", () => {
    expect(goalRealized({ metric: "new_properties", period: "2026-11", user_id: "a", target: 5 }, data)).toBe(1);
    expect(goalRealized({ metric: "leads", period: "2026-11", user_id: "a", target: 5 }, data)).toBe(2);
    expect(goalRealized({ metric: "viewings", period: "2026-11", user_id: "a", target: 5 }, data)).toBe(1);
  });
  it("obiectivul agenției include toți agenții; comisionul adună tranzacțiile câștigate", () => {
    expect(goalRealized({ metric: "transactions", period: "2026-11", user_id: null, target: 5 }, data)).toBe(2);
    expect(goalRealized({ metric: "commission", period: "2026-11", user_id: "a", target: 3000 }, data)).toBe(1500);
  });
  it("procentul se oprește la 100", () => {
    expect(goalPercent(15, 10)).toBe(100);
    expect(goalPercent(1500, 3000)).toBe(50);
    expect(goalPercent(3, 0)).toBe(0);
  });
});
