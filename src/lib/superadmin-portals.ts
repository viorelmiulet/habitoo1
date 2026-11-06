/** Secțiunea „Portaluri” din Superadmin → Dashboard: reguli pure. */

export type PortalCard = { portal: string; agencies: number; published: number; errors: number };

export function buildPortalCardsFrom(rows: PortalCard[]): PortalCard[] {
  return rows
    .filter((r) => r.portal !== "facebook_catalog" && r.agencies > 0)
    .sort((a, b) => b.errors - a.errors || b.published - a.published || a.portal.localeCompare(b.portal));
}

export const agenciesLabel = (n: number) => (n === 1 ? "1 agenție" : `${n} ${n >= 20 ? "de " : ""}agenții`);

export function publishedLabel(c: PortalCard): string {
  if (c.published === 0 && c.errors === 0) return "fără publicări";
  return `${c.published} ${c.published >= 20 ? "de " : ""}publicate`;
}

export function errorsPill(n: number): { text: string; tone: "error" | "ok" } {
  if (n === 0) return { text: "fără erori", tone: "ok" };
  return { text: n === 1 ? "1 eroare" : `${n} ${n >= 20 ? "de " : ""}erori`, tone: "error" };
}

/** Textul de sub titlu, doar cu erori de platformă (conexiuni + publicări). */
export function portalsSubtitle(failingConnections: number, cards: PortalCard[]): string {
  const pubErrors = cards.reduce((n, c) => n + c.errors, 0);
  if (failingConnections === 0 && pubErrors === 0) return "Toate conexiunile funcționează";
  const parts: string[] = [];
  if (failingConnections > 0) parts.push(failingConnections === 1 ? "1 conexiune cu eroare" : `${failingConnections} ${failingConnections >= 20 ? "de " : ""}conexiuni cu eroare`);
  if (pubErrors > 0) parts.push(`${errorsPill(pubErrors).text} de platformă la publicare`);
  return parts.join(" · ");
}
