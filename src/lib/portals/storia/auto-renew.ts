/** Explicit property choices override the agency default for both transactions. */
export function effectiveStoriaAutoRenew(override: boolean | null | undefined, agencyDefault: boolean | undefined): boolean {
  return override ?? (agencyDefault === true);
}

export function storiaContentUpdateEligible(status: string | null | undefined, externalId: string | null | undefined): boolean {
  return Boolean(externalId && ["published", "updated", "pending"].includes(status ?? ""));
}

/**
 * The „Prelungire automată” block belongs to the card only while the agent can
 * still act on the advert: Storia is checked for this property, or an advert is
 * already published / still processing. Anywhere else the saved value is kept
 * untouched but nothing is shown.
 */
export function storiaAutoRenewVisible(input: {
  selected: boolean;
  listingStatus: string;
  externalId: string | null;
}): boolean {
  return input.selected === true || storiaContentUpdateEligible(input.listingStatus, input.externalId);
}

/** Only these documented remote states allow a content-only update. */
export function storiaAdvertContentUpdateEligible(code: string | null): boolean {
  return code !== null && ["active", "new", "unpaid", "blocked"].includes(code);
}