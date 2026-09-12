import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { graceBannerText, graceHeadline, subscriptionState } from "@/lib/subscription";
import type { CurrentUser } from "@/hooks/use-session";

/**
 * Banda roșie permanentă din perioada de grație. O vede doar administratorul
 * agenției — agenții simpli nu au ce face cu reînnoirea.
 */
export function SubscriptionBanner({ user }: { user: CurrentUser }) {
  if (user.isSuperadmin || !user.isAdmin) return null;
  const state = subscriptionState(user.organization);
  if (state.kind !== "grace") return null;
  const isTrial = user.organization?.is_trial ?? false;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-destructive/50 bg-destructive px-4 py-2 text-center text-sm font-semibold text-destructive-foreground"
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span>{graceBannerText(state.daysLeft)}</span>
      <span className="font-normal opacity-90">
        {graceHeadline(isTrial)} pe {formatDate(state.expiresAt)}. Contactează administratorul
        platformei pentru {isTrial ? "activarea abonamentului" : "reînnoire"}.
      </span>
    </div>
  );
}

