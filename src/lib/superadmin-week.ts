/** Blocul „Ultimele 7 zile” din Superadmin → Dashboard: reguli pure. */

export const WEEK_PORTAL_OPERATIONS = ["publish", "update", "republish", "withdraw"] as const;

export type SuperadminWeek = {
  activeAgencies: number;
  paidAgencies: number;
  trialAgencies: number;
  activeUsers: number;
  totalUsers: number;
  newProperties: number;
  newPropertiesPrev: number;
  portalSuccess: number;
  /** Doar eșecurile de platformă; erorile de completare a anunțului nu intră. */
  portalFailed: number;
};

export type DeltaTone = "up" | "down" | "flat";

/** „+2 față de săpt. trecută”, „−1 față de săpt. trecută”, „la fel ca săpt. trecută”. */
export function weekDelta(current: number, previous: number): { label: string; tone: DeltaTone } {
  const d = current - previous;
  if (d === 0) return { label: "la fel ca săpt. trecută", tone: "flat" };
  return { label: `${d > 0 ? "+" : "−"}${Math.abs(d)} față de săpt. trecută`, tone: d > 0 ? "up" : "down" };
}

/** „98% reușite · 59 eșuate”; fără operațiuni nu inventăm un procent. */
export function portalOpsHint(success: number, failed: number): string {
  const total = success + failed;
  if (total === 0) return "nicio operațiune";
  return `${Math.round((success / total) * 100)}% reușite · ${failed} eșuate`;
}

/** Utilizator activ = autentificat în ultimele 7 zile. */
export function isActiveLogin(lastSignInAt: string | null | undefined, since: number): boolean {
  if (!lastSignInAt) return false;
  const t = new Date(lastSignInAt).getTime();
  return !Number.isNaN(t) && t >= since;
}
