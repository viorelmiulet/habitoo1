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
export type StoriaAutoRenewBulkInput = {
  propertyIds: string[];
  /** Rows of the caller's organization only. */
  properties: { id: string; assigned_to: string | null; archived_at: string | null; feedEligible: boolean }[];
  listings: { property_id: string; status: string | null; external_id: string | null }[];
  publications: { property_id: string; enabled: boolean | null }[];
  connectionActivated: boolean;
  agentOnly: boolean;
  userId: string;
};

export type StoriaAutoRenewBulkPlan = {
  /** Active Storia advert: updated at Storia now. */
  sendNow: string[];
  /** Saved only; applied at the next publication. */
  saveOnly: string[];
  /** Missing or (for agents) assigned to someone else. */
  forbidden: string[];
};

/** Same eligibility as the single-property update, for many properties at once. */
export function planStoriaAutoRenewBulk(input: StoriaAutoRenewBulkInput): StoriaAutoRenewBulkPlan {
  const props = new Map(input.properties.map((p) => [p.id, p]));
  const listings = new Map(input.listings.map((l) => [l.property_id, l]));
  const pubs = new Map(input.publications.map((p) => [p.property_id, p]));
  const plan: StoriaAutoRenewBulkPlan = { sendNow: [], saveOnly: [], forbidden: [] };
  for (const id of [...new Set(input.propertyIds)]) {
    const p = props.get(id);
    if (!p || (input.agentOnly && p.assigned_to !== input.userId)) { plan.forbidden.push(id); continue; }
    const l = listings.get(id);
    const ok = !p.archived_at && p.feedEligible && pubs.get(id)?.enabled === true && input.connectionActivated
      && storiaContentUpdateEligible(l?.status, l?.external_id);
    (ok ? plan.sendNow : plan.saveOnly).push(id);
  }
  return plan;
}
