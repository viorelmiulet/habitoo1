import { describe, expect, it } from "vitest";

import { subscriptionPickerValue } from "../SubscriptionPicker";

describe("caseta de perioadă a abonamentului", () => {
  it("preselectează perioadele gratuite, nu „Fără termen”", () => {
    expect(subscriptionPickerValue("trial_14d")).toBe("trial_14d");
    expect(subscriptionPickerValue("trial_30d")).toBe("trial_30d");
  });

  it("păstrează perioadele plătite", () => {
    expect(subscriptionPickerValue("30d")).toBe("30d");
    expect(subscriptionPickerValue("12m")).toBe("12m");
  });

  it("cade pe „Fără termen” doar fără termen sau la valori necunoscute", () => {
    expect(subscriptionPickerValue(null)).toBe("none");
    expect(subscriptionPickerValue("altceva")).toBe("none");
  });
});
