export const STORIA_EXPIRED_REASON = "Expirat pe Storia (fără autoprelungire)";

/**
 * Filtrul server pentru anunțurile debifate automat la expirarea Storia:
 * doar retragerile cu motivul de expirare, nu și cele manuale.
 */
export function storiaExpiredListingFilter() {
  return { portal: "storia", status: "withdrawn", reason: STORIA_EXPIRED_REASON } as const;
}

export function storiaValidTo(raw: unknown): string | null {
  const rec = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const state = rec.state && typeof rec.state === "object" ? rec.state as Record<string, unknown> : {};
  const value = rec.valid_to ?? state.valid_to;
  const time = typeof value === "number" ? (value < 1e12 ? value * 1000 : value)
    : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function storiaExpirySummary(externalId: string | null, rawStates: unknown) {
  const refs = (externalId ?? "").split("|").flatMap(part => {
    const [transaction, uuid] = part.split(":");
    return (transaction === "SALE" || transaction === "RENT") && uuid ? [uuid.toLowerCase()] : [];
  });
  const states = rawStates && typeof rawStates === "object" ? rawStates as Record<string, { code?: string }> : {};
  const outdated = refs.filter(uuid => states[uuid]?.code === "outdated").length;
  return { allOutdated: refs.length > 0 && outdated === refs.length, partial: outdated > 0 && outdated < refs.length };
}

export function shouldDeselectStoria(input: { autoRenew: boolean | null; enabled: boolean; externalId: string | null; states: unknown }) {
  return input.autoRenew === false && input.enabled && storiaExpirySummary(input.externalId, input.states).allOutdated;
}