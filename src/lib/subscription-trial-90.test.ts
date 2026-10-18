import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTrialTerm, subscriptionState, subscriptionTermLabel, SUBSCRIPTION_TERMS } from "@/lib/subscription";
import { subscriptionPickerValue } from "@/components/superadmin/SubscriptionPicker";
import { trialBannerState } from "@/components/app/TrialBanner";
import type { CurrentUser } from "@/hooks/use-session";

const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();
const DAY = 86_400_000;

describe("perioada de probă de 90 de zile", () => {
  it("trial_90d e termen de probă cu eticheta cerută", () => {
    expect(SUBSCRIPTION_TERMS).toContain("trial_90d");
    expect(isTrialTerm("trial_90d")).toBe(true);
    expect(subscriptionTermLabel("trial_90d")).toBe("Perioadă de probă (90 de zile)");
    expect(subscriptionPickerValue("trial_90d")).toBe("trial_90d");
  });

  it("termenii existenți rămân neschimbați", () => {
    expect(isTrialTerm("trial_14d")).toBe(true);
    expect(isTrialTerm("30d")).toBe(false);
    expect(isTrialTerm("12m")).toBe(false);
  });

  it("bannerul de probă arată 90 de zile pentru o agenție nouă", () => {
    const user = { isSuperadmin: false, isAdmin: true, organization: { subscription_term: "trial_90d", subscription_expires_at: new Date(NOW + 90 * DAY).toISOString(), is_trial: false } } as unknown as CurrentUser;
    expect(trialBannerState(user, NOW)?.daysLeft).toBe(90);
  });

  it("după expirare intră în grație de 5 zile", () => {
    const s = subscriptionState({ subscription_expires_at: new Date(NOW - DAY).toISOString() }, NOW);
    expect(s.kind).toBe("grace");
  });

  it("textele publice nu mai menționează 14 sau 30 de zile gratuite", () => {
    for (const f of ["src/routes/preturi.tsx", "src/routes/index.tsx", "src/components/marketing/HomePricingSection.tsx"]) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/(14|30) de zile (de acces )?gratuit/);
      expect(text).toContain("90 de zile");
    }
  });
});
