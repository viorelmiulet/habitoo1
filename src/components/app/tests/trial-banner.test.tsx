/**
 * Banda de trial apare doar cât timp perioada gratuită e activă.
 */
import { describe, expect, it } from "vitest";
import { trialBannerState } from "@/components/app/TrialBanner";
import type { CurrentUser } from "@/hooks/use-session";

const NOW = new Date("2026-09-22T12:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function user(
  org: Partial<{
    subscription_term: string | null;
    subscription_expires_at: string | null;
    is_trial: boolean | null;
  }> | null,
  extra: Partial<CurrentUser> = {},
): CurrentUser {
  return {
    isSuperadmin: false,
    isAdmin: true,
    organization: org as CurrentUser["organization"],
    ...extra,
  } as CurrentUser;
}

describe("trialBannerState", () => {
  it("afișează zilele rămase în trial activ", () => {
    const state = trialBannerState(
      user({
        subscription_term: "trial_14d",
        subscription_expires_at: new Date(NOW + 5 * DAY).toISOString(),
        is_trial: true,
      }),
      NOW,
    );
    expect(state?.daysLeft).toBe(5);
    expect(state?.canActivate).toBe(true);
  });

  it("nu apare pentru abonament plătit", () => {
    expect(
      trialBannerState(
        user({
          subscription_term: "12m",
          subscription_expires_at: new Date(NOW + 100 * DAY).toISOString(),
          is_trial: false,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("nu apare fără termen", () => {
    expect(
      trialBannerState(
        user({ subscription_term: null, subscription_expires_at: null, is_trial: true }),
        NOW,
      ),
    ).toBeNull();
  });

  it("nu apare în perioada de grație", () => {
    expect(
      trialBannerState(
        user({
          subscription_term: "trial_14d",
          subscription_expires_at: new Date(NOW - 2 * DAY).toISOString(),
          is_trial: true,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("nu apare pentru superadmin", () => {
    expect(
      trialBannerState(
        user(
          {
            subscription_term: "trial_30d",
            subscription_expires_at: new Date(NOW + 3 * DAY).toISOString(),
            is_trial: true,
          },
          { isSuperadmin: true },
        ),
        NOW,
      ),
    ).toBeNull();
  });

  it("agentul simplu vede banda, dar fără butonul de activare", () => {
    const state = trialBannerState(
      user(
        {
          subscription_term: "trial_30d",
          subscription_expires_at: new Date(NOW + 3 * DAY).toISOString(),
          is_trial: true,
        },
        { isAdmin: false },
      ),
      NOW,
    );
    expect(state?.daysLeft).toBe(3);
    expect(state?.canActivate).toBe(false);
  });
});
