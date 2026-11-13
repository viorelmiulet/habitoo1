/**
 * Potriviri active (browser-safe, determinist): ce alerte și notificări
 * rezultă dintr-o proprietate nouă/mai ieftină sau dintr-o cerere nouă.
 * Folosește matcherul existent `scoreMatch`; nu apelează AI.
 */
import { scoreMatch, type MatchScore } from "@/lib/matching";

export const ACTIVE_MATCH_DEFAULT_THRESHOLD = 75;
export const ACTIVE_MATCH_DAILY_LIMIT = 20;
export const ACTIVE_REQUEST_STATUSES = ["new", "active", "working"] as const;
export const PRICE_DROP_RATIO = 0.97;

export type MatchTrigger = "published" | "price_drop" | "request_created";
export type AlertStatus = "new" | "sent" | "ignored";

export type MatchRequest = {
  id: string; organization_id: string; status: string; assigned_to: string | null; contact_id: string | null; title: string;
  kind: "buy" | "rent" | "invest"; budget_min: number | null; budget_max: number | null; cities: string[]; areas: string[];
  rooms_min: number | null; rooms_max: number | null; surface_min: number | null; features: string[]; property_type: string | null;
};
export type MatchProperty = {
  id: string; organization_id: string; title: string; status: string; publish_status: string;
  deleted_at: string | null; archived_at: string | null; transaction_kind: "sale" | "rent"; price: number | null;
  city: string | null; district: string | null; address: string | null; rooms: number | null;
  surface: number | null; usable_surface: number | null; features: string[] | null; property_type: string;
};
export type ExistingAlert = { id: string; request_id: string; property_id: string; price_drop_notified_at: string | null };

export type PlannedAlert = {
  request_id: string; property_id: string; agent_id: string | null; contact_id: string | null;
  score: number; reasons: string[]; misses: string[]; trigger: MatchTrigger; notify: boolean;
};
export type PlannedRenotify = { alert_id: string; request_id: string; property_id: string; agent_id: string | null; score: number; reasons: string[]; misses: string[]; notify: boolean };
export type ActiveMatchPlan = { inserts: PlannedAlert[]; renotify: PlannedRenotify[] };

export const pairKey = (requestId: string, propertyId: string) => `${requestId}|${propertyId}`;

export function isLiveProperty(p: Pick<MatchProperty, "status" | "publish_status" | "deleted_at" | "archived_at">) {
  return p.status === "active" && p.publish_status === "published" && !p.deleted_at && !p.archived_at;
}

export function isActiveRequest(r: Pick<MatchRequest, "status">) {
  return (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(r.status);
}

/** Scădere de preț semnificativă (≥ 3%). */
export function isSignificantPriceDrop(oldPrice: number | null, newPrice: number | null) {
  return oldPrice != null && newPrice != null && oldPrice > 0 && newPrice <= oldPrice * PRICE_DROP_RATIO;
}

export function scorePair(request: MatchRequest, property: MatchProperty): MatchScore {
  return scoreMatch(request as never, { ...property, surface: property.usable_surface ?? property.surface } as never);
}

/** Ziua curentă în România (început, ISO UTC) pentru limita zilnică per agent. */
export function romaniaDayStart(at: Date): string {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const day = fmt(at);
  // Ora României este UTC+2 sau UTC+3: caută prima oră UTC care cade în aceeași zi locală.
  for (const offset of [3, 2]) {
    const candidate = new Date(`${day}T00:00:00Z`);
    candidate.setUTCHours(candidate.getUTCHours() - offset);
    if (fmt(candidate) === day) return candidate.toISOString();
  }
  return new Date(`${day}T00:00:00Z`).toISOString();
}

export type PlanInput = {
  trigger: MatchTrigger;
  organizationId: string;
  properties: MatchProperty[];
  requests: MatchRequest[];
  existing: ExistingAlert[];
  threshold: number;
  /** agent → câte alerte a primit deja azi (notificări). */
  notifiedToday: Map<string, number>;
  /** contact → responsabil, când cererea nu are agent. */
  contactOwner: Map<string, string | null>;
  dailyLimit?: number;
};

/** Planul determinist: doar agenția proprietății, cereri active, scor ≥ prag, o dată per pereche. */
export function planActiveMatches(input: PlanInput): ActiveMatchPlan {
  const limit = input.dailyLimit ?? ACTIVE_MATCH_DAILY_LIMIT;
  const existing = new Map(input.existing.map((a) => [pairKey(a.request_id, a.property_id), a]));
  const counts = new Map(input.notifiedToday);
  const take = (agent: string | null) => {
    if (!agent) return false;
    const n = counts.get(agent) ?? 0;
    if (n >= limit) return false;
    counts.set(agent, n + 1);
    return true;
  };
  const pairs: { request: MatchRequest; property: MatchProperty; match: MatchScore }[] = [];
  for (const property of input.properties) {
    if (property.organization_id !== input.organizationId || !isLiveProperty(property)) continue;
    for (const request of input.requests) {
      if (request.organization_id !== input.organizationId || !isActiveRequest(request)) continue;
      const match = scorePair(request, property);
      if (match.score >= input.threshold) pairs.push({ request, property, match });
    }
  }
  pairs.sort((a, b) => b.match.score - a.match.score);
  const plan: ActiveMatchPlan = { inserts: [], renotify: [] };
  for (const { request, property, match } of pairs) {
    const agent = request.assigned_to ?? (request.contact_id ? input.contactOwner.get(request.contact_id) ?? null : null);
    const prev = existing.get(pairKey(request.id, property.id));
    const base = { request_id: request.id, property_id: property.id, agent_id: agent, score: match.score, reasons: match.reasons, misses: match.misses };
    if (prev) {
      if (input.trigger === "price_drop" && !prev.price_drop_notified_at) {
        plan.renotify.push({ ...base, alert_id: prev.id, notify: take(agent) });
      }
      continue;
    }
    plan.inserts.push({ ...base, contact_id: request.contact_id, trigger: input.trigger, notify: take(agent) });
  }
  return plan;
}

export function notificationTitle(score: number, propertyTitle: string, clientName: string) {
  return `Potrivire ${score}%: ${propertyTitle} pentru ${clientName}`;
}

export function notificationBody(reasons: string[], misses: string[], priceDrop: boolean) {
  const parts = [] as string[];
  if (priceDrop) parts.push("Prețul a scăzut.");
  if (reasons.length) parts.push(`Îndeplinite: ${reasons.join(", ")}.`);
  if (misses.length) parts.push(`Lipsă: ${misses.join(", ")}.`);
  return parts.join(" ");
}

/** Mesaj simplu, fără AI, doar din faptele proprietății. */
export function templateMatchMessage(input: { clientFirstName: string | null; property: { title: string; city: string | null; rooms: number | null; price: number | null; currency: string | null }; link: string | null }) {
  const p = input.property;
  const facts = [p.rooms ? `${p.rooms} ${p.rooms === 1 ? "cameră" : "camere"}` : null, p.city, p.price ? `${new Intl.NumberFormat("ro-RO").format(p.price)} ${p.currency ?? "EUR"}` : null].filter(Boolean).join(", ");
  const hello = input.clientFirstName ? `Bună ziua, ${input.clientFirstName}!` : "Bună ziua!";
  return [
    hello,
    `Am o proprietate care se potrivește cu ce căutați: ${p.title}${facts ? ` (${facts})` : ""}.`,
    input.link ? `Detalii: ${input.link}` : null,
    "Vă interesează o vizionare?",
  ].filter(Boolean).join("\n");
}

export function whatsappUrl(phone: string | null | undefined, text: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `40${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string | null | undefined, subject: string, body: string) {
  if (!email?.includes("@")) return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
