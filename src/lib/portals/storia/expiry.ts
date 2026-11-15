export const STORIA_EXPIRED_REASON = "Expirat pe Storia (fără autoprelungire)";

export function storiaValidTo(raw: unknown): string | null {
  const rec = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const state = rec.state && typeof rec.state === "object" ? rec.state as Record<string, unknown> : {};
  const value = rec.valid_to ?? state.valid_to;
  const time = typeof value === "number" ? (value < 1e12 ? value * 1000 : value)
    : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function storiaExpiresAt(publishedAt: string | null, autoRenew: boolean | null): string | null {
  if (autoRenew !== false || !publishedAt || !Number.isFinite(Date.parse(publishedAt))) return null;
  return new Date(Date.parse(publishedAt) + 30 * 86400_000).toISOString();
}

export function shouldDeselectStoria(input: { autoRenew: boolean | null; enabled: boolean; expiresAt: string | null; now: number }) {
  return input.autoRenew === false && input.enabled && input.expiresAt !== null && Date.parse(input.expiresAt) <= input.now;
}