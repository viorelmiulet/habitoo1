/**
 * Blocul „De rezolvat” din Superadmin → Dashboard: reguli pure, fără acces la
 * date, ca serverul și interfața să le folosească identic și să fie testate.
 */
import { subscriptionTermLabel } from "@/lib/subscription";

const DAY = 24 * 60 * 60 * 1000;
export const EXPIRY_WARNING_DAYS = 7;

export type TodoCounts = {
  pendingRegistrations: number;
  pendingSubscriptionRequests: number;
  pendingPortalActivations: number;
  openTickets: number;
  failingConnections: number;
};

export type SubscriptionAlert = {
  organizationId: string;
  organizationName: string;
  termLabel: string;
  expiresAt: string;
  /** Zile rămase (negativ = expirat de atâtea zile). */
  daysLeft: number;
  expired: boolean;
  activeProperties: number;
  lastLoginAt: string | null;
};

export type BlockedPublishing = {
  organizationId: string;
  organizationName: string;
  /** Anunțuri distincte (proprietăți) cu cel puțin o eroare. */
  listings: number;
  /** Portaluri distincte afectate. */
  portals: number;
  /** Rânduri portal × anunț în eroare. */
  total: number;
  notPublishable: number;
  other: number;
};

export type SuperadminTodo = {
  counts: TodoCounts;
  expiring: SubscriptionAlert[];
  expired: SubscriptionAlert[];
  blocked: BlockedPublishing[];
  /** Conexiunile care nu funcționează: agenția și portalul fiecăreia. */
  brokenConnections: { organizationId: string; organizationName: string; portal: string }[];
};

/** Eroarea portalului care înseamnă că anunțul nu e publicat în CRM. */
export function isNotPublishableError(message: string | null | undefined): boolean {
  return /oferta nu este publicabil/i.test(message ?? "");
}

/** Durata termenului, ca text: „Trial 30 zile”, „30 de zile” etc. */
export function termLabel(term: string | null | undefined, isTrial: boolean): string {
  const label = subscriptionTermLabel(term);
  if (label !== "Fără termen") return isTrial && !term?.startsWith("trial_") ? `Trial ${label}` : label;
  return isTrial ? "Trial" : "Abonament";
}

/** Clasifică o agenție: expiră în ≤7 zile, deja expirată sau nimic. */
export function classifyExpiry(
  expiresAt: string | null | undefined,
  now: number,
): { kind: "expiring" | "expired"; daysLeft: number } | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  if (t <= now) return { kind: "expired", daysLeft: -Math.floor((now - t) / DAY) };
  const daysLeft = Math.ceil((t - now) / DAY);
  return daysLeft <= EXPIRY_WARNING_DAYS ? { kind: "expiring", daysLeft } : null;
}

/** Grupează erorile de publicare pe agenție, cu împărțirea pe tipuri. */
export function groupBlockedPublishing(
  rows: { organization_id: string; property_id: string; portal_key: string; last_error: string | null }[],
  orgName: (id: string) => string,
): BlockedPublishing[] {
  const map = new Map<string, BlockedPublishing & { _p: Set<string>; _k: Set<string> }>();
  for (const r of rows) {
    const g = map.get(r.organization_id) ?? {
      organizationId: r.organization_id,
      organizationName: orgName(r.organization_id),
      listings: 0,
      portals: 0,
      total: 0,
      notPublishable: 0,
      other: 0,
      _p: new Set<string>(),
      _k: new Set<string>(),
    };
    g.total += 1;
    g._p.add(r.property_id);
    g._k.add(r.portal_key);
    if (isNotPublishableError(r.last_error)) g.notPublishable += 1;
    else g.other += 1;
    map.set(r.organization_id, g);
  }
  return [...map.values()]
    .map(({ _p, _k, ...g }) => ({ ...g, listings: _p.size, portals: _k.size }))
    .sort((a, b) => b.listings - a.listings);
}

/** „pe 11 portaluri · 363 de erori (356 „Oferta nu este publicabilă”, 7 alte erori)”. */
export function blockedDetail(b: BlockedPublishing): string {
  const ro = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${n >= 20 || n === 0 ? "de " : ""}${many}`);
  return `pe ${ro(b.portals, "portal", "portaluri")} · ${ro(b.total, "eroare", "erori")} (${b.notPublishable} „Oferta nu este publicabilă”, ${b.other} ${b.other === 1 ? "altă eroare" : "alte erori"})`;
}

export const COUNT_LABELS: Record<keyof TodoCounts, string> = {
  pendingRegistrations: "Cereri de înscriere",
  pendingSubscriptionRequests: "Cereri de abonament",
  pendingPortalActivations: "Activări portal",
  openTickets: "Tichete de suport",
  failingConnections: "Conexiuni de portal",
};

/** Numărul de carduri afișate (= lucruri de rezolvat). */
export function todoItemCount(todo: SuperadminTodo): number {
  const c = todo.counts;
  return (
    [c.pendingRegistrations, c.pendingSubscriptionRequests, c.pendingPortalActivations, c.openTickets, c.failingConnections].filter((n) => n > 0).length +
    todo.expiring.length +
    todo.expired.length +
    todo.blocked.length
  );
}

/** Categoriile 1–4 și 7 care sunt la zero, pentru linia „Nimic în așteptare”. */
export function zeroCategories(counts: TodoCounts): string[] {
  return (Object.keys(COUNT_LABELS) as (keyof TodoCounts)[])
    .filter((k) => counts[k] === 0)
    .map((k) => COUNT_LABELS[k]);
}

/** „Duminică, 1 noiembrie · 2 lucruri de rezolvat”. */
export function todoSubtitle(now: Date, items: number): string {
  const day = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Bucharest",
  }).format(now);
  const cap = day.charAt(0).toUpperCase() + day.slice(1);
  const what =
    items === 0
      ? "nimic de rezolvat"
      : items === 1
        ? "1 lucru de rezolvat"
        : `${items} ${items >= 20 ? "de " : ""}lucruri de rezolvat`;
  return `${cap} · ${what}`;
}

/** „42 de anunțuri” / „3 anunțuri” / „1 anunț”. */
export function anunturiLabel(n: number): string {
  if (n === 1) return "1 anunț";
  return `${n} ${n >= 20 || n === 0 ? "de " : ""}anunțuri`;
}
