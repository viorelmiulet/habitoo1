/** Secțiunea „Portaluri” din Superadmin → Dashboard: reguli pure. */

import type { PortalHealthState } from "@/lib/portal-connection-health";

export type PortalCard = { portal: string; agencies: number; published: number; failingAgencies: number; state: PortalHealthState };

const STATE_ORDER: Record<PortalHealthState, number> = { integration: 0, agencies: 1, ok: 2 };

export function buildPortalCardsFrom(rows: PortalCard[]): PortalCard[] {
  return rows
    .filter((r) => r.portal !== "facebook_catalog" && r.agencies > 0)
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.failingAgencies - a.failingAgencies || b.published - a.published || a.portal.localeCompare(b.portal));
}

export const agenciesLabel = (n: number) => (n === 1 ? "1 agenție" : `${n} ${n >= 20 ? "de " : ""}agenții`);

export function publishedLabel(c: PortalCard): string {
  if (c.published === 0) return "fără publicări";
  return `${c.published} ${c.published >= 20 ? "de " : ""}publicate`;
}

