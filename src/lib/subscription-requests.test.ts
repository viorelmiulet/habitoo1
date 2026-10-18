import { describe, it, expect } from "vitest";
import { canChooseSubscription, subscriptionPlanFits, defaultSubscriptionDates, subscriptionResolutionSchema } from "./subscription-requests";
import { PLAN_PRICES, planAnnualTotal } from "./plans";
describe("cereri abonament", () => {
  it("permite alegerea doar administratorului agenției", () => {
    expect(canChooseSubscription({ isAdmin: true, isSuperadmin: false })).toBe(true);
    expect(canChooseSubscription({ isAdmin: false, isSuperadmin: false })).toBe(false);
    expect(canChooseSubscription({ isAdmin: true, isSuperadmin: true })).toBe(false);
    expect(canChooseSubscription({ isAdmin: true, isSuperadmin: false, impersonation: {} })).toBe(false);
  });
  it("blochează Basic peste 3 agenți și Pro peste 10", () => {
    expect(subscriptionPlanFits("basic", 3)).toBe(true);
    expect(subscriptionPlanFits("basic", 4)).toBe(false);
    expect(subscriptionPlanFits("pro", 10)).toBe(true);
    expect(subscriptionPlanFits("pro", 11)).toBe(false);
    expect(subscriptionPlanFits("unlimited", 1001)).toBe(true);
  });
  it("calculează 30 zile calendaristice", () => expect(defaultSubscriptionDates("30d", "2026-10-18")).toEqual({ start: "2026-10-18", expires: "2026-11-17" }));
  it("calculează 12 luni inclusiv anul bisect", () => {
    expect(defaultSubscriptionDates("12m", "2026-10-18").expires).toBe("2027-10-18");
    expect(defaultSubscriptionDates("12m", "2024-02-29").expires).toBe("2025-02-28");
  });
  it("reducerea anuală este 50% pentru toate planurile", () => {
    expect(PLAN_PRICES.basic).toEqual({ monthly: 10, annualMonthly: 5 });
    expect(planAnnualTotal("basic")).toBe(60);
    expect(planAnnualTotal("pro")).toBe(240);
    expect(planAnnualTotal("unlimited")).toBe(600);
  });
  it("respingerea cere motiv", () => expect(subscriptionResolutionSchema.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", status: "rejected", reason: " " }).success).toBe(false));
  it("activarea cere expirare ulterioară începutului", () => expect(subscriptionResolutionSchema.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", status: "approved", starts: "2026-10-18T00:00:00Z", expires: "2026-10-17T00:00:00Z" }).success).toBe(false));
});