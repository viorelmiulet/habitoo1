/** Cardul „Agenții” din Superadmin → Dashboard: reguli pure. */
import { termLabel } from "@/lib/superadmin-todo";

const DAY = 86_400_000;
export const AGENCY_ROW_LIMIT = 20;
export const INACTIVE_DAYS = 14;
const TZ = "Europe/Bucharest";

export type AgencyDot = "red" | "gold" | "green";

export type AgencyStats = {
  id: string;
  name: string;
  plan: string | null;
  isTrial: boolean;
  term: string | null;
  expiresAt: string | null;
  users: number;
  activeProperties: number;
  portals: number;
  /** Conexiuni de portal care nu funcționează (doar erori de conectare). */
  connectionErrors: number;
  lastLoginAt: string | null;
};

export type AgencyRow = AgencyStats & { dot: AgencyDot; subscription: string };

export function agencyDot(lastLoginAt: string | null, activeProperties: number, now: number): AgencyDot {
  const t = lastLoginAt ? new Date(lastLoginAt).getTime() : NaN;
  if (Number.isNaN(t) || now - t > INACTIVE_DAYS * DAY) return "red";
  if (activeProperties === 0) return "gold";
  return "green";
}

const PLAN_NAMES: Record<string, string> = { basic: "Basic", pro: "Pro", unlimited: "Unlimited" };

/** „Trial · 30 zile”, „Basic · 30 zile”, „Basic · fără termen”. Durata vine din `termLabel`. */
export function subscriptionCell(plan: string | null, term: string | null, isTrial: boolean): string {
  const label = termLabel(term, isTrial);
  const days = label.match(/(\d+)\s*(?:de\s*)?(zile|luni)/);
  const duration = days ? `${days[1]} ${days[2]}` : "fără termen";
  const kind = isTrial || label.startsWith("Trial") || label.startsWith("Perioadă") ? "Trial" : (PLAN_NAMES[plan ?? ""] ?? "Abonament");
  return `${kind} · ${duration}`;
}

const dayKey = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);
const dayIndex = (t: number) => Math.round(Date.parse(dayKey(t)) / DAY);

function shortDate(t: number, now: number): string {
  const sameYear = new Intl.DateTimeFormat("en", { timeZone: TZ, year: "numeric" }).format(t) === new Intl.DateTimeFormat("en", { timeZone: TZ, year: "numeric" }).format(now);
  return new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
    .format(t)
    .replace(/\./g, "");
}

export type ExpiryCell = { text: string; tone: "plain" | "warning" | "error" | "none" };

export function expiryCell(expiresAt: string | null, now: number): ExpiryCell {
  const t = expiresAt ? new Date(expiresAt).getTime() : NaN;
  if (Number.isNaN(t)) return { text: "—", tone: "none" };
  if (t <= now) return { text: "expirat", tone: "error" };
  const days = Math.ceil((t - now) / DAY);
  if (days <= 7) return { text: `${shortDate(t, now)} · în ${days} ${days === 1 ? "zi" : "zile"}`, tone: "warning" };
  return { text: shortDate(t, now), tone: "plain" };
}

export function lastLoginCell(lastLoginAt: string | null, now: number): { main: string; ago: string | null } {
  const t = lastLoginAt ? new Date(lastLoginAt).getTime() : NaN;
  if (Number.isNaN(t)) return { main: "niciodată", ago: null };
  const diff = dayIndex(now) - dayIndex(t);
  const time = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(t);
  if (diff <= 0) return { main: `azi, ${time}`, ago: null };
  if (diff === 1) return { main: `ieri, ${time}`, ago: null };
  return { main: shortDate(t, now), ago: `acum ${diff} zile` };
}

const DOT_RANK: Record<AgencyDot, number> = { red: 0, gold: 1, green: 2 };

export function buildAgencyRowsFrom(stats: AgencyStats[], now: number): AgencyRow[] {
  return stats
    .map((s) => ({ ...s, dot: agencyDot(s.lastLoginAt, s.activeProperties, now), subscription: subscriptionCell(s.plan, s.term, s.isTrial) }))
    .sort((a, b) => DOT_RANK[a.dot] - DOT_RANK[b.dot] || b.activeProperties - a.activeProperties || a.name.localeCompare(b.name, "ro"));
}
