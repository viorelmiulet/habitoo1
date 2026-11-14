/** Rezumatul zilnic „Azi”: logică deterministă, browser-safe. */
export type BriefActionKind = "overdue" | "new_lead" | "viewing" | "portal_error" | "stagnant" | "match" | "owner_report" | "incomplete";
export type BriefAction = { kind: BriefActionKind; label: string; to: string; search?: Record<string, string>; at?: string | null };
export type BriefCounts = Record<BriefActionKind, number> & { activitiesToday: number };
export type BriefTeamRow = { userId: string; name: string; inactive: boolean; portalErrors: number };
export type DailyBriefData = { counts: BriefCounts; actions: BriefAction[]; team: BriefTeamRow[] | null; computedAt: string };

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
