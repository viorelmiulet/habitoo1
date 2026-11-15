/** Rezumatul zilnic „Azi”: logică deterministă, browser-safe. */
export type BriefActionKind = "overdue" | "new_lead" | "viewing" | "portal_error" | "stagnant" | "match" | "owner_report" | "incomplete";
export type BriefAction = { kind: BriefActionKind; label: string; to: string; search?: Record<string, string>; at?: string | null };
export type BriefCounts = Record<BriefActionKind, number> & { activitiesToday: number };
export type BriefTeamRow = { userId: string; name: string; inactive: boolean; portalErrors: number };
export type DailyBriefData = { counts: BriefCounts; actions: BriefAction[]; team: BriefTeamRow[] | null; computedAt: string };

export const BRIEF_LABELS: Record<BriefActionKind | "activitiesToday", string> = {
  viewing: "Vizionări azi", activitiesToday: "Activități azi", overdue: "Follow-up-uri restante",
  new_lead: "Lead-uri noi nerăspunse", stagnant: "Lead-uri stagnante", match: "Potriviri noi (24h)",
  owner_report: "Rapoarte de trimis", portal_error: "Erori pe portaluri", incomplete: "Anunțuri incomplete",
};

export function briefDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type BriefLead = { id: string; name: string; stage: string; created_at: string; last_interaction_at: string | null; next_followup_at: string | null };
export type BriefActivity = { id: string; title: string; kind: string; starts_at: string };
export type BriefProperty = { id: string; title: string; description: string | null; price: number | string | null; created_at: string; assigned_to: string | null };
export type BriefPortalError = { property_id: string; portal_key: string; created_at: string };

/** Erorile aceleiași perechi proprietate–portal nu se dublează între publicații și joburi. */
export function uniquePortalErrors(rows: BriefPortalError[]): BriefPortalError[] {
  const pairs = new Map<string, BriefPortalError>();
  for (const row of rows) {
    const key = `${row.property_id}:${row.portal_key}`;
    const previous = pairs.get(key);
    if (!previous || row.created_at < previous.created_at) pairs.set(key, row);
  }
  return [...pairs.values()];
}

export function assembleBrief(input: {
  now: Date; activities: BriefActivity[]; leads: BriefLead[]; stagnantIds: string[];
  properties: BriefProperty[]; imagePropertyIds: string[]; portalErrors: BriefPortalError[];
  matches: { id: string; request_id: string; score: number; created_at: string }[];
  reports: { id: string; property_id: string; created_at: string }[]; team: BriefTeamRow[] | null;
}): DailyBriefData {
  const items: BriefAction[] = [];
  const add = (kind: BriefActionKind, label: string, to: string, at: string, search?: Record<string, string>) => items.push({ kind, label, to, at, search });
  for (const a of input.activities.filter(a => a.kind === "viewing")) add("viewing", a.title, "/app/activities", a.starts_at, { q: a.title, period: "today" });
  for (const l of input.leads) {
    if (l.next_followup_at && l.next_followup_at < input.now.toISOString()) add("overdue", `Relansează ${l.name}`, "/app/leads", l.next_followup_at, { lead: l.id });
    if (l.stage === "new" && !l.last_interaction_at) add("new_lead", `Răspunde: ${l.name}`, "/app/leads", l.created_at, { lead: l.id });
    if (input.stagnantIds.includes(l.id)) add("stagnant", `Reia legătura: ${l.name}`, "/app/leads", l.last_interaction_at ?? l.created_at, { lead: l.id });
  }
  const properties = new Map(input.properties.map(p => [p.id, p]));
  const errorRows = uniquePortalErrors(input.portalErrors);
  for (const id of new Set(errorRows.map(e => e.property_id))) {
    const p = properties.get(id);
    if (p) add("portal_error", `Verifică publicarea: ${p.title}`, `/app/properties/${id}`, errorRows.filter(e => e.property_id === id).map(e => e.created_at).sort()[0] ?? p.created_at, { tab: "publishing" });
  }
  for (const m of input.matches) add("match", `Potrivire ${m.score}%`, `/app/requests/${m.request_id}`, m.created_at);
  for (const r of input.reports) add("owner_report", `Trimite raportul: ${properties.get(r.property_id)?.title ?? "proprietate"}`, `/app/properties/${r.property_id}`, r.created_at, { tab: "owner-reports" });
  const images = new Set(input.imagePropertyIds);
  for (const p of input.properties) {
    if (!images.has(p.id) || !p.description?.trim() || !p.price || Number(p.price) <= 0) add("incomplete", `Completează: ${p.title}`, `/app/properties/${p.id}`, p.created_at);
  }
  const counts = Object.fromEntries(BRIEF_ORDER.map(k => [k, items.filter(a => a.kind === k).length])) as Record<BriefActionKind, number>;
  // În numărătoare sunt erori distincte de portal, în Top 5 o singură acțiune per anunț.
  counts.portal_error = errorRows.length;
  return { counts: { ...counts, activitiesToday: input.activities.length }, actions: selectTopActions(items), team: input.team, computedAt: input.now.toISOString() };
}

export const BRIEF_ORDER: BriefActionKind[] = ["overdue", "new_lead", "viewing", "portal_error", "stagnant", "match", "owner_report", "incomplete"];

/** Top 5: restanțe, lead-uri noi, vizionări de azi, erori portal, restul; în grup, cele mai vechi primele. */
export function selectTopActions(items: BriefAction[], limit = 5): BriefAction[] {
  const rank = (k: BriefActionKind) => BRIEF_ORDER.indexOf(k);
  return [...items]
    .sort((a, b) => rank(a.kind) - rank(b.kind) || String(a.at ?? "").localeCompare(String(b.at ?? "")))
    .slice(0, limit);
}

export function briefIsEmpty(counts: BriefCounts): boolean {
  return BRIEF_ORDER.every((k) => counts[k] === 0) && counts.activitiesToday === 0;
}

export type SentenceDeps = {
  featureEnabled: () => Promise<boolean>;
  creditsBlocked: () => Promise<string | null>;
  generate: () => Promise<string>;
};

/** Fraza AI opțională: null (fără eroare) dacă funcția e oprită, creditele lipsesc sau apelul eșuează. */
export async function maybeAiSentence(deps: SentenceDeps): Promise<string | null> {
  try {
    if (!(await deps.featureEnabled())) return null;
    if (await deps.creditsBlocked()) return null;
    const text = (await deps.generate()).trim().replace(/\s+/g, " ");
    return text ? text.slice(0, 300) : null;
  } catch {
    return null;
  }
}
