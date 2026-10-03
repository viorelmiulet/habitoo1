import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyPreselection,
  buildMyPortalItems,
  computePreselection,
  selectablePortalKeys,
  validatePortalKeys,
} from "@/lib/agent-portal-preferences";

const conn = (portal: string, extra: Record<string, unknown> = {}) => ({
  portal,
  activated: true,
  external_account_id: "acc",
  portal_credentials_encrypted: "v1.secret",
  last_sync_error: null,
  last_sync_status: null,
  ...extra,
});

describe("Portalurile mele — status", () => {
  it("perechile apar o singură dată, cu numele perechii", () => {
    const items = buildMyPortalItems([], []);
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain("olx");
    expect(ids).not.toContain("publi24");
    expect(new Set(ids).size).toBe(ids.length);
    const storia = items.find((i) => i.id === "storia");
    if (storia) expect(storia.name).toBe("Storia.ro + OLX.ro");
  });

  it("status corect și fără câmpuri sensibile", () => {
    const items = buildMyPortalItems(
      [conn("clickimob"), conn("storia", { last_sync_error: "boom secret" })],
      ["clickimob"],
    );
    expect(items.find((i) => i.id === "clickimob")?.status).toBe("connected");
    expect(items.find((i) => i.id === "clickimob")?.selected).toBe(true);
    const storia = items.find((i) => i.id === "storia");
    if (storia) expect(storia.status).toBe("error");
    for (const i of items) expect(Object.keys(i).sort()).toEqual(["id", "name", "selected", "status"]);
    expect(JSON.stringify(items)).not.toMatch(/secret|acc/);
    expect(items.find((i) => i.id === "properstar")?.status).toBe("disconnected");
  });
});

describe("validare", () => {
  it("respinge portal inexistent", () => {
    expect(() => validatePortalKeys(["nu_exista"])).toThrow(/Portal necunoscut/);
    expect(() => validatePortalKeys(["olx"])).toThrow();
  });
  it("acceptă portaluri din registru, fără duplicate", () => {
    const [first] = [...selectablePortalKeys()];
    expect(validatePortalKeys([first, first])).toEqual([first]);
  });
});

describe("preselecția la anunț nou", () => {
  const prefs = [
    { portal_key: "clickimob", selected: true, created_at: "2026-10-01T00:00:00Z" },
    { portal_key: "storia", selected: false, created_at: "2026-10-01T00:00:00Z" },
  ];
  const newProp = { assigned_to: "u1", created_by: "u1", created_at: "2026-10-02T00:00:00Z" };
  const cells = [
    { portalId: "clickimob", selected: false, configured: true, availability: "available" },
    { portalId: "storia", selected: false, configured: true, availability: "available" },
    { portalId: "properstar", selected: false, configured: false, availability: "available" },
  ];

  it("fără alegere salvată: comportament neschimbat", () => {
    expect(computePreselection({ userId: "u1", prefs: [], property: newProp, hasPortalHistory: false })).toBeNull();
    expect(applyPreselection(cells, null)).toEqual({ clickimob: false, storia: false, properstar: false });
  });

  it("cu alegere: bifează doar portalurile alese și conectate", () => {
    const keys = computePreselection({ userId: "u1", prefs, property: newProp, hasPortalHistory: false });
    expect(keys).toEqual(["clickimob"]);
    expect(applyPreselection(cells, [...keys!, "properstar"])).toEqual({
      clickimob: true,
      storia: false,
      properstar: false,
    });
  });

  it("anunțurile existente rămân neschimbate", () => {
    const old = { ...newProp, created_at: "2026-09-01T00:00:00Z" };
    expect(computePreselection({ userId: "u1", prefs, property: old, hasPortalHistory: false })).toBeNull();
    expect(computePreselection({ userId: "u1", prefs, property: newProp, hasPortalHistory: true })).toBeNull();
    expect(computePreselection({ userId: "u2", prefs, property: newProp, hasPortalHistory: false })).toBeNull();
  });
});

describe("server și RLS", () => {
  const fn = readFileSync("src/lib/agent-portal-preferences.functions.ts", "utf8");
  it("salvarea nu acceptă user_id din client și scrie ca utilizatorul (RLS)", () => {
    expect(fn).toMatch(/z\.object\(\{ portalKeys:/);
    expect(fn).not.toMatch(/userId: z\./);
    expect(fn).toMatch(/user_id: ctx\.userId/);
    expect(fn).toMatch(/ctx\.supabase\s*\.from\("agent_portal_preferences"\)\s*\.upsert/);
  });
  it("politicile limitează la propriul utilizator și organizație; adminul doar citește", () => {
    const sql = readFileSync("drizzle/migrations/0105_agent_portal_preferences.sql", "utf8");
    expect(sql).toMatch(/FOR INSERT TO authenticated\s+WITH CHECK \(user_id = auth\.uid\(\) AND organization_id = public\.current_org\(\)\)/);
    expect(sql).toMatch(/FOR UPDATE TO authenticated\s+USING \(user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/org admin reads org prefs[\s\S]*FOR SELECT/);
    expect(sql).not.toMatch(/FOR DELETE|FOR ALL|TO anon/);
  });
  it("fila Portaluri e vizibilă agenților, dar cardurile de admin rămân ascunse", () => {
    const page = readFileSync("src/routes/_authenticated/app.settings.tsx", "utf8");
    expect(page).toMatch(/user\?\.organization \|\| user\?\.isAdmin \? <TabsTrigger[^>]*value="portals"/);
    expect(page).toMatch(/user\?\.isAdmin \? \(\s*<>\s*<AgencyPortalCatalogCard \/>/);
  });
});
