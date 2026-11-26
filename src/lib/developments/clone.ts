import type { PortalDefinition } from "@/lib/portals/registry";
import { isFeedPullPortal } from "@/lib/portals/registry";

export const CLONE_MAX = 200;

/** Direct API portals explicitly supported by development selections and copies. */
export const DEVELOPMENT_API_PORTAL_IDS: ReadonlySet<string> = new Set(["mvaimobiliare"]);

export type CloneCopy = { original_id: string; original_reference: string | null; copy_id: string; copy_reference: string };
export type CloneSkip = { original_id: string; original_reference: string | null; reason: string };
export type ClonePortalSkip = { copy_id: string; portal: string; reason: string };
export type CloneResult = { copies: CloneCopy[]; skipped: CloneSkip[]; portalSkipped: ClonePortalSkip[]; photoErrors: number };

/** Feed or index portal: the portal pulls Habitoo data (feed_pull, dynamic feed or public feed path). */
export function isFeedOrIndexPortal(d: PortalDefinition): boolean {
  return isFeedPullPortal(d) || d.dynamic_feed === true || Boolean(d.public_feed_path_template) ||
    (d.capabilities.includes("feed_pull") && !d.capabilities.includes("publish_listing"));
}

/** Development/copy portals: Storia developer units, activated feeds/indexes and the explicit API allowlist. */
export function clonePortalIds(activated: Set<string>, definitions: PortalDefinition[]): string[] {
  const out: string[] = [];
  for (const d of definitions) {
    if (d.status !== "available" || !activated.has(d.id)) continue;
    if (d.id === "storia" || isFeedOrIndexPortal(d) || DEVELOPMENT_API_PORTAL_IDS.has(d.id)) out.push(d.id);
  }
  return [...new Set(out)];
}

export function cloneConfirmText(n: number): string {
  return `Se vor crea ${n} ${n === 1 ? "copie nouă" : "copii noi"} în ansamblu; anunțurile originale rămân neschimbate. Copiile preiau locația ansamblului.`;
}
