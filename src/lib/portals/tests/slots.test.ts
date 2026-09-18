import { describe, expect, it } from "vitest";

import {
  allocationFor,
  checkPortalSlot,
  computePortalSlotState,
  reassignRefusalMessage,
  remainingSlots,
  slotRefusalMessage,
} from "@/lib/portals/slots";
import { humanizeSlotGuardError } from "@/lib/portals/slots";
import {
  ensurePortalSlotAvailable,
  ensureReassignSlots,
  loadMyPortalSlot,
  requireSlotAdminOrg,
  SLOT_ADMIN_ONLY,
} from "@/lib/portals/slots.server";

/* ------------------------------- fake Supabase ------------------------------ */

type Rows = Record<string, Record<string, unknown>[]>;

function fakeAdmin(rows: Rows) {
  const inserted: { table: string; row: Record<string, unknown> }[] = [];

  function builder(table: string) {
    const filters: { column: string; value: unknown }[] = [];
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return api;
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ column, value: values });
        return api;
      },
      insert: async (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return { data: null, error: null };
      },
      matching: () =>
        (rows[table] ?? []).filter((row) =>
          filters.every(({ column, value }) =>
            Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
          ),
        ),
      maybeSingle: async () => ({ data: api.matching()[0] ?? null, error: null }),
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve({ data: api.matching(), error: null }).then(resolve),
    };
    return api;
  }

  return {
    admin: { from: (table: string) => builder(table) } as never,
    inserted,
  };
}

const ORG = "org-1";
const PORTAL = "lacheie";

function state(input: {
  agencyTotal?: number | null;
  allocations?: { userId: string; slots: number | null }[];
  selections?: string[];
  properties?: { id: string; assignedTo: string | null }[];
}) {
  return computePortalSlotState({
    portalKey: PORTAL,
    agencyTotal: input.agencyTotal ?? null,
    allocations: input.allocations ?? [],
    selections: (input.selections ?? []).map((propertyId) => ({ propertyId })),
    properties: input.properties ?? [],
  });
}

/* ---------------------------------- pure ---------------------------------- */

describe("locuri de publicare — logică", () => {
  it("nelimitat când rândul lipsește sau este NULL", () => {
    const s = state({ allocations: [{ userId: "agent-2", slots: null }] });
    expect(allocationFor(s, "agent-1")).toBeNull();
    expect(allocationFor(s, "agent-2")).toBeNull();
    expect(remainingSlots(null, 99)).toBeNull();
    expect(
      checkPortalSlot(s, { propertyId: "p-new", agentId: "agent-1" }),
    ).toEqual({ ok: true, alreadyCounted: false });
  });

  it("agentul poate publica pe orice portal: limita se aplică separat pe fiecare portal", () => {
    // Pe La Cheie agentul are 1 loc și l-a ocupat; pe Imobiliare.ro nu are
    // nicio limitare, deci aceeași ofertă trece fără restricție.
    const lacheie = state({
      allocations: [{ userId: "agent-1", slots: 1 }],
      selections: ["p-1"],
      properties: [{ id: "p-1", assignedTo: "agent-1" }],
    });
    expect(checkPortalSlot(lacheie, { propertyId: "p-2", agentId: "agent-1" }).ok).toBe(false);

    const imobiliare = computePortalSlotState({
      portalKey: "imobiliare",
      agencyTotal: null,
      allocations: [],
      selections: [],
      properties: [],
    });
    expect(checkPortalSlot(imobiliare, { propertyId: "p-2", agentId: "agent-1" })).toEqual({
      ok: true,
      alreadyCounted: false,
    });
  });

  it("limita per agent blochează", () => {
    const s = state({
      allocations: [{ userId: "agent-1", slots: 1 }],
      selections: ["p-1"],
      properties: [
        { id: "p-1", assignedTo: "agent-1" },
        { id: "p-2", assignedTo: "agent-1" },
      ],
    });
    expect(checkPortalSlot(s, { propertyId: "p-2", agentId: "agent-1" })).toEqual({
      ok: false,
      scope: "agent",
      used: 1,
      total: 1,
    });
  });

  it("totalul agenției blochează chiar dacă agentul are loc", () => {
    const s = state({
      agencyTotal: 2,
      allocations: [{ userId: "agent-2", slots: 10 }],
      selections: ["p-1", "p-2"],
      properties: [
        { id: "p-1", assignedTo: "agent-1" },
        { id: "p-2", assignedTo: "agent-1" },
        { id: "p-3", assignedTo: "agent-2" },
      ],
    });
    expect(checkPortalSlot(s, { propertyId: "p-3", agentId: "agent-2" })).toEqual({
      ok: false,
      scope: "agency",
      used: 2,
      total: 2,
    });
  });

  it("o proprietate deja selectată nu consumă alt loc (republicare/actualizare)", () => {
    const s = state({
      agencyTotal: 1,
      allocations: [{ userId: "agent-1", slots: 1 }],
      selections: ["p-1", "p-1"],
      properties: [{ id: "p-1", assignedTo: "agent-1" }],
    });
    expect(s.usedByAgency).toBe(1);
    expect(checkPortalSlot(s, { propertyId: "p-1", agentId: "agent-1" })).toEqual({
      ok: true,
      alreadyCounted: true,
    });
  });

  it("mesajele numesc portalul, agentul și consumul", () => {
    const message = slotRefusalMessage({
      portalName: "La Cheie",
      agentName: "Ana Pop",
      scope: "agent",
      used: 3,
      total: 3,
    });
    expect(message).toContain("La Cheie");
    expect(message).toContain("Ana Pop");
    expect(message).toContain("3/3");
    expect(reassignRefusalMessage({ agentName: "Ana Pop", portalNames: ["La Cheie"] })).toContain(
      "La Cheie",
    );
  });
});

/* --------------------------------- server --------------------------------- */

describe("locuri de publicare — verificarea din fluxul de publicare", () => {
  const property = { id: "p-2", organization_id: ORG, assigned_to: "agent-1" };

  it("refuză când agentul responsabil nu are locuri, chiar dacă publică administratorul", async () => {
    const { admin, inserted } = fakeAdmin({
      properties: [
        { id: "p-1", organization_id: ORG, assigned_to: "agent-1" },
        property,
      ],
      portal_slot_limits: [{ organization_id: ORG, portal_key: PORTAL, total_slots: null }],
      portal_slot_allocations: [
        { organization_id: ORG, portal_key: PORTAL, user_id: "agent-1", slots: 1 },
      ],
      portal_publications: [
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-1", enabled: true },
      ],
      profiles: [{ id: "agent-1", full_name: "Ana Pop", email: "ana@x.ro" }],
      audit_logs: [],
    });

    const result = await ensurePortalSlotAvailable(admin, {
      organizationId: ORG,
      portalKey: PORTAL,
      portalName: "La Cheie",
      propertyId: "p-2",
      actorId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Ana Pop");
    // Refuzul ajunge în auditul existent.
    expect(inserted.some((entry) => entry.row["action"] === "portal.slot_refused")).toBe(true);
  });

  it("acceptă când oferta este deja selectată (actualizare/retrimitere)", async () => {
    const { admin } = fakeAdmin({
      properties: [property],
      portal_slot_allocations: [
        { organization_id: ORG, portal_key: PORTAL, user_id: "agent-1", slots: 1 },
      ],
      portal_publications: [
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-2", enabled: true },
      ],
      profiles: [],
      audit_logs: [],
    });
    const result = await ensurePortalSlotAvailable(admin, {
      organizationId: ORG,
      portalKey: PORTAL,
      portalName: "La Cheie",
      propertyId: "p-2",
      actorId: null,
    });
    expect(result.ok).toBe(true);
  });

  it("blochează mutarea proprietății către un agent fără locuri libere", async () => {
    const { admin } = fakeAdmin({
      properties: [
        { id: "p-1", organization_id: ORG, assigned_to: "agent-2" },
        { id: "p-2", organization_id: ORG, assigned_to: "agent-1" },
      ],
      portal_slot_allocations: [
        { organization_id: ORG, portal_key: PORTAL, user_id: "agent-2", slots: 1 },
      ],
      portal_publications: [
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-1", enabled: true },
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-2", enabled: true },
      ],
      profiles: [{ id: "agent-2", full_name: "Ion Ionescu", email: null }],
      audit_logs: [],
    });
    const result = await ensureReassignSlots(admin, {
      organizationId: ORG,
      propertyId: "p-2",
      newAgentId: "agent-2",
      actorId: "admin-1",
      portalName: () => "La Cheie",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Ion Ionescu");
  });

  it("permite mutarea când noul agent are loc liber", async () => {
    const { admin } = fakeAdmin({
      properties: [{ id: "p-2", organization_id: ORG, assigned_to: "agent-1" }],
      portal_slot_allocations: [
        { organization_id: ORG, portal_key: PORTAL, user_id: "agent-2", slots: 2 },
      ],
      portal_publications: [
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-2", enabled: true },
      ],
      profiles: [],
      audit_logs: [],
    });
    const result = await ensureReassignSlots(admin, {
      organizationId: ORG,
      propertyId: "p-2",
      newAgentId: "agent-2",
      actorId: "admin-1",
      portalName: () => "La Cheie",
    });
    expect(result.ok).toBe(true);
  });
});

/* ------------------------- acces la administrare -------------------------- */

describe("locuri de publicare — acces la administrare", () => {
  const ORG_B = "org-2";

  function context(userId: string, superadmin: boolean) {
    return {
      userId,
      supabase: { rpc: async () => ({ data: superadmin, error: null }) },
    } as never;
  }

  function accessAdmin() {
    return fakeAdmin({
      organizations: [{ id: ORG }, { id: ORG_B }],
      profiles: [
        { id: "admin-1", organization_id: ORG },
        { id: "agent-1", organization_id: ORG },
        { id: "super-1", organization_id: null },
      ],
      user_roles: [{ user_id: "admin-1", organization_id: ORG, role: "agency_admin" }],
    }).admin;
  }

  it("agentul este refuzat, inclusiv cu organizația altcuiva", async () => {
    const admin = accessAdmin();
    await expect(
      requireSlotAdminOrg(context("agent-1", false), null, { admin }),
    ).rejects.toThrow(SLOT_ADMIN_ONLY);
    await expect(
      requireSlotAdminOrg(context("agent-1", false), ORG_B, { admin }),
    ).rejects.toThrow(SLOT_ADMIN_ONLY);
    await expect(
      requireSlotAdminOrg(context("agent-1", false), ORG, { admin }),
    ).rejects.toThrow(SLOT_ADMIN_ONLY);
  });

  it("administratorul agenției lucrează doar pe agenția lui", async () => {
    const admin = accessAdmin();
    await expect(requireSlotAdminOrg(context("admin-1", false), null, { admin })).resolves.toBe(
      ORG,
    );
    await expect(requireSlotAdminOrg(context("admin-1", false), ORG, { admin })).resolves.toBe(ORG);
    await expect(
      requireSlotAdminOrg(context("admin-1", false), ORG_B, { admin }),
    ).rejects.toThrow(SLOT_ADMIN_ONLY);
  });

  it("superadminul lucrează pe agenția primită explicit", async () => {
    const admin = accessAdmin();
    await expect(requireSlotAdminOrg(context("super-1", true), ORG_B, { admin })).resolves.toBe(
      ORG_B,
    );
    await expect(requireSlotAdminOrg(context("super-1", true), null, { admin })).rejects.toThrow();
  });

  it("agentul își vede doar propriile cifre", async () => {
    const { admin } = fakeAdmin({
      properties: [
        { id: "p-1", organization_id: ORG, assigned_to: "agent-1" },
        { id: "p-2", organization_id: ORG, assigned_to: "agent-2" },
      ],
      portal_slot_limits: [{ organization_id: ORG, portal_key: PORTAL, total_slots: 5 }],
      portal_slot_allocations: [
        { organization_id: ORG, portal_key: PORTAL, user_id: "agent-1", slots: 3 },
        { organization_id: ORG, portal_key: PORTAL, user_id: "agent-2", slots: 9 },
      ],
      portal_publications: [
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-1", enabled: true },
        { organization_id: ORG, portal_key: PORTAL, property_id: "p-2", enabled: true },
      ],
    });
    const mine = await loadMyPortalSlot(admin, {
      organizationId: ORG,
      userId: "agent-1",
      portalKey: PORTAL,
    });
    expect(mine).toEqual({
      portalKey: PORTAL,
      allocated: 3,
      used: 1,
      remaining: 2,
      agencyExhausted: false,
    });
    expect(JSON.stringify(mine)).not.toContain("agent-2");
  });
});

describe("mesajul plasei de siguranță din baza de date", () => {
  it("înlocuiește eroarea brută cu numele portalurilor", () => {
    const message = humanizeSlotGuardError(
      'new row violates: Agentul nu are locuri libere de publicare pe: lacheie, storia',
      (key) => (key === "lacheie" ? "La Cheie" : "Storia"),
    );
    expect(message).toContain("La Cheie");
    expect(message).toContain("Storia");
    expect(humanizeSlotGuardError("duplicate key", () => "x")).toBeNull();
  });
});
