import { buildMarketingFactSheet, marketingContextHash, validateMarketingFacts } from "./facts";
export const DESCRIPTION_PORTALS = ["olx_direct", "storia", "properstar"] as const;
export type DescriptionPortal = (typeof DESCRIPTION_PORTALS)[number];
export type SavedPortalDescription = { body: string; context_hash: string; context_snapshot: unknown; applied_at: string | null };
export function portalDescriptionFromDraft(draft: SavedPortalDescription | null, property: Record<string, unknown>, portal: string): string | null {
  if (!draft?.applied_at || !draft.context_snapshot || typeof draft.context_snapshot !== "object" || !("portalDescription" in draft.context_snapshot) || draft.context_snapshot.portalDescription !== portal) return null;
  const facts = buildMarketingFactSheet(property);
  if (draft.context_hash !== marketingContextHash(facts) || validateMarketingFacts(draft.body, facts).status === "invalid") return null;
  return draft.body;
}