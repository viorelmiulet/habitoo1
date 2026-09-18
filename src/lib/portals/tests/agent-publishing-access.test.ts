/**
 * Agentul poate publica pe portaluri, dar EXCLUSIV ofertele unde este agentul
 * responsabil. Administratorul agenției și Superadminul nu sunt limitați.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const properties: Record<string, { id: string; organization_id: string; assigned_to: string | null }> =
  {
    "p-agent": { id: "p-agent", organization_id: "org-1", assigned_to: "agent-1" },
    "p-other": { id: "p-other", organization_id: "org-1", assigned_to: "agent-2" },
  };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, string> = {};
        const builder = {
          eq: (col: string, value: string) => {
            filters[col] = value;
            return builder;
          },
          maybeSingle: async () => {
            if (table === "organizations") return { data: { id: filters["id"] ?? null } };
            const row = properties[filters["id"] ?? ""];
            if (!row || row.organization_id !== filters["organization_id"]) return { data: null };
            return { data: row };
          },
        };
        return builder;
      },
    }),
  },
}));

function ctx(userId: string, roles: { superadmin?: boolean; orgAdmin?: boolean }) {
  return {
    userId,
    supabase: {
      rpc: async (fn: string) => ({
        data: fn === "is_superadmin" ? roles.superadmin === true : roles.orgAdmin === true,
        error: null,
      }),
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { organization_id: "org-1" } }) }),
        }),
      }),
    },
  } as never;
}

describe("accesul agentului la publicarea pe portaluri", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("agentul nu mai este refuzat: primește agenția din sesiune, marcat agentOnly", async () => {
    const { resolvePublishingOrg } = await import("@/lib/portals.functions");
    const out = await resolvePublishingOrg(ctx("agent-1", {}));
    expect(out).toEqual({ organizationId: "org-1", superadmin: false, agentOnly: true });
  });

  it("administratorul agenției nu este limitat la propriile oferte", async () => {
    const { resolvePublishingOrg } = await import("@/lib/portals.functions");
    const out = await resolvePublishingOrg(ctx("admin-1", { orgAdmin: true }));
    expect(out.agentOnly).toBe(false);
  });

  it("agentul poate opera oferta unde este agentul responsabil", async () => {
    const { assertPortalPropertyAccess } = await import("@/lib/portals.functions");
    await expect(
      assertPortalPropertyAccess({
        organizationId: "org-1",
        propertyId: "p-agent",
        agentOnly: true,
        userId: "agent-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("agentul este refuzat pe oferta altui agent", async () => {
    const { assertPortalPropertyAccess, PORTAL_AGENT_NOT_RESPONSIBLE } = await import(
      "@/lib/portals.functions"
    );
    await expect(
      assertPortalPropertyAccess({
        organizationId: "org-1",
        propertyId: "p-other",
        agentOnly: true,
        userId: "agent-1",
      }),
    ).rejects.toThrow(PORTAL_AGENT_NOT_RESPONSIBLE);
  });

  it("administratorul poate opera oferta oricărui agent din agenția lui", async () => {
    const { assertPortalPropertyAccess } = await import("@/lib/portals.functions");
    await expect(
      assertPortalPropertyAccess({
        organizationId: "org-1",
        propertyId: "p-other",
        agentOnly: false,
        userId: "admin-1",
      }),
    ).resolves.toBeUndefined();
  });
});
