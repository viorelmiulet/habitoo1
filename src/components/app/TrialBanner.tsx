import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { formatDate } from "@/lib/format";
import { isTrialTerm, subscriptionState } from "@/lib/subscription";
import type { CurrentUser } from "@/hooks/use-session";

export type TrialBannerState = { daysLeft: number; expiresAt: string; canActivate: boolean } | null;

/**
 * Decizia de afișare a benzii de trial, separată de randare ca să fie testabilă.
 * Banda apare doar cât timp perioada gratuită e încă activă; în grație și după
 * expirare preia banda roșie existentă (`SubscriptionBanner`).
 */
export function trialBannerState(user: CurrentUser, now: number = Date.now()): TrialBannerState {
  if (user.isSuperadmin) return null;
  const org = user.organization;
  if (!org) return null;
  const trial = (org.is_trial ?? false) || isTrialTerm(org.subscription_term);
  if (!trial) return null;
  const state = subscriptionState(org, now);
  if (state.kind !== "active") return null;
  return { daysLeft: state.daysLeft, expiresAt: state.expiresAt, canActivate: user.isAdmin };
}

/** Banda informativă vizibilă în toată aplicația cât timp agenția e în trial. */
export function TrialBanner({ user }: { user: CurrentUser }) {
  const state = trialBannerState(user);
  if (!state) return null;
  const zile = state.daysLeft === 1 ? "1 zi rămasă" : `${state.daysLeft} zile rămase`;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-info/30 bg-info/10 px-4 py-2 text-center text-sm text-foreground"
    >
      <Sparkles className="size-4 shrink-0" />
      <span className="font-semibold">Perioadă de testare · {zile}</span>
      <span className="opacity-90">se încheie pe {formatDate(state.expiresAt)}</span>
      {state.canActivate ? (
        <Link
          to="/preturi"
          className="rounded-md bg-info px-2.5 py-1 text-xs font-semibold text-info-foreground underline-offset-2 hover:underline"
        >
          Activează acum
        </Link>
      ) : null}
    </div>
  );
}
