/**
 * „Portalurile mele”: preselecția personală a agentului pentru anunțurile lui
 * noi. Doar pre-bifează în fila Publicare; nu restricționează nimic.
 * Logică pură, partajată între server, UI și teste.
 */
import {
  configurablePortals,
  derivePortalConnectionStatus,
  portalDisplayName,
  type PortalConnectionStatus,
} from "@/lib/portals/registry";
import { agencyGridItems } from "@/lib/portals/grid-state";

export type MyPortalItem = {
  id: string;
  name: string;
  status: PortalConnectionStatus;
  selected: boolean;
};

export type ConnectionRowForStatus = {
  portal: string;
  activated: boolean | null;
  external_account_id: string | null;
  portal_credentials_encrypted: string | null;
  last_sync_error: string | null;
  last_sync_status: string | null;
};

/** Portalurile agenției (perechile o singură dată), cu statusul afișat și alegerea agentului. */
export function buildMyPortalItems(
  connections: ConnectionRowForStatus[],
  selectedKeys: Iterable<string>,
): MyPortalItem[] {
  const rows = new Map(connections.map((c) => [c.portal, c]));
  const chosen = new Set(selectedKeys);
  const items = agencyGridItems(
    configurablePortals().map((p) => ({ id: p.id, availability: p.status, definition: p })),
  );
  return items.map(({ id, definition }) => {
    const row = rows.get(id);
    return {
      id,
      name: portalDisplayName(id),
      status: derivePortalConnectionStatus({
        definition,
        activated: row?.activated === true,
        externalAccountId: row?.external_account_id ?? null,
        hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
        hasOAuthTokens: Boolean(row?.portal_credentials_encrypted),
        lastError: row?.last_sync_error ?? null,
        lastSyncStatus: row?.last_sync_status ?? null,
      }),
      selected: chosen.has(id),
    };
  });
}

/** Cheile valide pentru alegere: portalurile din grila agenției. */
export function selectablePortalKeys(): Set<string> {
  return new Set(
    agencyGridItems(configurablePortals().map((p) => ({ id: p.id, availability: p.status }))).map(
      (p) => p.id,
    ),
  );
}

/** Aruncă eroare pentru orice cheie necunoscută; întoarce lista fără duplicate. */
export function validatePortalKeys(keys: string[]): string[] {
  const valid = selectablePortalKeys();
  const unknown = keys.filter((k) => !valid.has(k));
  if (unknown.length > 0) throw new Error(`Portal necunoscut: ${unknown.join(", ")}`);
  return [...new Set(keys)];
}

/**
 * Preselecția pentru un anunț. `null` = comportamentul de acum, neschimbat.
 * Se aplică doar unui anunț NOU al agentului: creat după prima lui alegere
 * salvată, atribuit lui și fără nicio publicare sau ofertă pe portal.
 */
export function computePreselection(input: {
  userId: string;
  prefs: { portal_key: string; selected: boolean; created_at: string }[];
  property: { assigned_to: string | null; created_by: string | null; created_at: string };
  hasPortalHistory: boolean;
}): string[] | null {
  const chosen = input.prefs.filter((p) => p.selected).map((p) => p.portal_key);
  if (chosen.length === 0) return null;
  if (input.hasPortalHistory) return null;
  const owner = input.property.assigned_to ?? input.property.created_by;
  if (owner !== input.userId) return null;
  const firstChoice = input.prefs
    .map((p) => Date.parse(p.created_at))
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  if (!(Date.parse(input.property.created_at) >= firstChoice)) return null;
  return chosen;
}

/** Bifele inițiale din fila Publicare, cu preselecția aplicată doar portalurilor conectate. */
export function applyPreselection(
  cells: { portalId: string; selected: boolean; configured: boolean; availability: string }[],
  preselection: string[] | null,
): Record<string, boolean> {
  if (!preselection) return Object.fromEntries(cells.map((c) => [c.portalId, c.selected]));
  const chosen = new Set(preselection);
  return Object.fromEntries(
    cells.map((c) => [
      c.portalId,
      c.availability === "available" && c.configured && chosen.has(c.portalId),
    ]),
  );
}
