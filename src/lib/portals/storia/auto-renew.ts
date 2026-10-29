/** Explicit property choices override the agency default for both transactions. */
export function effectiveStoriaAutoRenew(override: boolean | null | undefined, agencyDefault: boolean | undefined): boolean {
  return override ?? (agencyDefault === true);
}

export function storiaContentUpdateEligible(status: string | null | undefined, externalId: string | null | undefined): boolean {
  return Boolean(externalId && ["published", "updated", "pending"].includes(status ?? ""));
}

/** Only these documented remote states allow a content-only update. */
export function storiaAdvertContentUpdateEligible(code: string | null): boolean {
  return code !== null && ["active", "new", "unpaid", "blocked"].includes(code);
}