/**
 * Locuri de publicare pe portal — logică pură (fără rețea, fără bază de date).
 *
 * Reguli fixate:
 *  - `null` sau rând absent = NELIMITAT, atât la totalul agenției, cât și la alocarea agentului;
 *  - un loc este consumat de AGENTUL RESPONSABIL al proprietății (`properties.assigned_to`),
 *    nu de cine apasă butonul de publicare;
 *  - o proprietate = un loc pe portal, indiferent de câte trimiteri s-au făcut;
 *  - se numără ofertele selectate/publicate și neretrase pe portalul respectiv.
 */

export type PortalSlotAllocationRow = { userId: string; slots: number | null };

export type PortalSlotSelection = { propertyId: string };

export type PortalSlotProperty = { id: string; assignedTo: string | null };

export type PortalSlotState = {
  portalKey: string;
  /** Totalul agenției; `null` = nelimitat. */
  agencyTotal: number | null;
  /** Alocări explicite pe agent; cheia lipsă = nelimitat. */
  allocations: Map<string, number | null>;
  /** Locuri consumate în toată agenția pe acest portal. */
  usedByAgency: number;
  /** Locuri consumate de fiecare agent responsabil. */
  usedByAgent: Map<string, number>;
  /** Proprietățile care consumă deja un loc (nu mai consumă altul). */
  countedPropertyIds: Set<string>;
};

/** Alocarea agentului: rând absent sau `null` înseamnă nelimitat. */
export function allocationFor(state: PortalSlotState, agentId: string | null): number | null {
  if (!agentId) return null;
  if (!state.allocations.has(agentId)) return null;
  return state.allocations.get(agentId) ?? null;
}

/** Locuri rămase; `null` = nelimitat. */
export function remainingSlots(total: number | null, used: number): number | null {
  if (total === null) return null;
  return Math.max(total - used, 0);
}

export function computePortalSlotState(input: {
  portalKey: string;
  agencyTotal: number | null;
  allocations: PortalSlotAllocationRow[];
  /** Ofertele selectate și neretrase pe acest portal. */
  selections: PortalSlotSelection[];
  /** Proprietățile agenției, cu agentul responsabil. */
  properties: PortalSlotProperty[];
}): PortalSlotState {
  const assignedById = new Map(input.properties.map((p) => [p.id, p.assignedTo]));
  const countedPropertyIds = new Set<string>();
  const usedByAgent = new Map<string, number>();
  for (const selection of input.selections) {
    if (countedPropertyIds.has(selection.propertyId)) continue;
    if (!assignedById.has(selection.propertyId)) continue;
    countedPropertyIds.add(selection.propertyId);
    const agentId = assignedById.get(selection.propertyId) ?? null;
    if (agentId) usedByAgent.set(agentId, (usedByAgent.get(agentId) ?? 0) + 1);
  }
  const allocations = new Map<string, number | null>();
  for (const row of input.allocations) allocations.set(row.userId, row.slots);

  return {
    portalKey: input.portalKey,
    agencyTotal: input.agencyTotal,
    allocations,
    usedByAgency: countedPropertyIds.size,
    usedByAgent,
    countedPropertyIds,
  };
}

export type PortalSlotCheck =
  | { ok: true; alreadyCounted: boolean }
  | { ok: false; scope: "agent" | "agency"; used: number; total: number };

/**
 * Verifică dacă o proprietate poate ocupa un loc pe acest portal.
 * O proprietate care consumă deja un loc nu consumă altul (republicare,
 * actualizare, retrimiterea portofoliului).
 */
export function checkPortalSlot(
  state: PortalSlotState,
  input: { propertyId: string; agentId: string | null },
): PortalSlotCheck {
  if (state.countedPropertyIds.has(input.propertyId)) {
    return { ok: true, alreadyCounted: true };
  }
  const agentTotal = allocationFor(state, input.agentId);
  const agentUsed = input.agentId ? (state.usedByAgent.get(input.agentId) ?? 0) : 0;
  if (agentTotal !== null && agentUsed >= agentTotal) {
    return { ok: false, scope: "agent", used: agentUsed, total: agentTotal };
  }
  if (state.agencyTotal !== null && state.usedByAgency >= state.agencyTotal) {
    return { ok: false, scope: "agency", used: state.usedByAgency, total: state.agencyTotal };
  }
  return { ok: true, alreadyCounted: false };
}

/** Mesajul de refuz, în română, cu portalul, agentul și consumul real. */
export function slotRefusalMessage(input: {
  portalName: string;
  agentName: string | null;
  scope: "agent" | "agency";
  used: number;
  total: number;
}): string {
  const agent = input.agentName?.trim() ? input.agentName.trim() : "agentul responsabil";
  return input.scope === "agent"
    ? `${input.portalName}: ${agent} a folosit toate locurile de publicare alocate (${input.used}/${input.total}). Retrage un anunț de pe ${input.portalName} sau cere administratorului agenției mai multe locuri.`
    : `${input.portalName}: agenția a folosit toate locurile de publicare (${input.used}/${input.total}) — ultimul loc ar fi ocupat de ${agent}. Retrage un anunț de pe ${input.portalName} sau cere mai multe locuri.`;
}

/** Mesajul de refuz la mutarea proprietății către alt agent responsabil. */
export function reassignRefusalMessage(input: {
  agentName: string | null;
  portalNames: string[];
}): string {
  const agent = input.agentName?.trim() ? input.agentName.trim() : "agentul ales";
  return `Nu poți muta proprietatea către ${agent}: nu are locuri libere de publicare pe ${input.portalNames.join(", ")}. Eliberează locuri sau mărește alocarea înainte de reasignare.`;
}
