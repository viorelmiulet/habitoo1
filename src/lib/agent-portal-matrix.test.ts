import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildAgentPortalMatrix } from "@/lib/agent-portal-preferences";

const ORG = "org-a";
const conn = (portal: string) => ({
  portal,
  activated: true,
  external_account_id: "acc",
  portal_credentials_encrypted: "v1.secret",
  last_sync_error: null,
  last_sync_status: null,
});
const users = [
  { id: "u1", full_name: "Ana", organization_id: ORG, is_active: true },
  { id: "u2", full_name: "Bogdan", organization_id: ORG, is_active: true },
  { id: "u3", full_name: "Inactiv", organization_id: ORG, is_active: false },
  { id: "x1", full_name: "Alt", organization_id: "org-b", is_active: true },
];
const pref = (user_id: string, portal_key: string, selected: boolean, organization_id = ORG) => ({
  organization_id,
  user_id,
  portal_key,
  selected,
});

describe("Portaluri pe agent", () => {
  const m = buildAgentPortalMatrix({
    organizationId: ORG,
    users,
    connections: [conn("clickimob"), conn("properstar")],
    prefs: [
      pref("u1", "clickimob", true),
      pref("u1", "properstar", false),
      pref("x1", "clickimob", true, "org-b"),
      pref("u2", "clickimob", true, "org-b"),
    ],
  });

  it("rândurile corecte și contorul N din M", () => {
    expect(m.agents.map((a) => a.name)).toEqual(["Ana", "Bogdan"]);
    const ana = m.agents[0];
    expect(ana.chosen).toBe(1);
    expect(ana.available).toBe(2);
    expect(ana.cells.clickimob).toBe("chosen");
    expect(ana.cells.properstar).toBe("not_chosen");
    const disconnected = m.portals.find((p) => p.status === "disconnected");
    if (disconnected) expect(ana.cells[disconnected.id]).toBe("disconnected");
  });

  it("agentul fără alegeri: Nicio alegere încă (null)", () => {
    expect(m.agents[1].chosen).toBeNull();
  });

  it("nu folosește date din altă organizație", () => {
    expect(m.agents.some((a) => a.id === "x1")).toBe(false);
    // Rândul u2 din org-b nu contează pentru org-a.
    expect(m.agents[1].cells.clickimob).toBe("not_chosen");
    const other = buildAgentPortalMatrix({ organizationId: "org-b", users, connections: [], prefs: [] });
    expect(other.agents.map((a) => a.id)).toEqual(["x1"]);
  });

  it("perechile apar o singură dată, fără date de conectare", () => {
    const ids = m.portals.map((p) => p.id);
    expect(ids).not.toContain("olx");
    expect(ids).not.toContain("publi24");
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(m)).not.toMatch(/secret|acc\b|token|http/);
  });

  it("serverul cere is_org_admin, răspunde 403 și filtrează pe organizație", () => {
    const fn = readFileSync("src/lib/agent-portal-preferences.functions.ts", "utf8");
    const body = fn.slice(fn.indexOf("export const getAgentPortalMatrix"));
    expect(body).toMatch(/rpc\("is_org_admin"\)[\s\S]*setResponseStatus\(403\)/);
    expect(body.match(/\.eq\("organization_id", organizationId\)/g)?.length).toBe(3);
    expect(body).not.toMatch(/\.(insert|upsert|update|delete)\(/);
  });

  it("cardul apare doar pentru adminul agenției", () => {
    const page = readFileSync("src/routes/_authenticated/app.settings.tsx", "utf8");
    expect(page).toMatch(/user\?\.role === "agency_admin" \? <AgentPortalMatrixCard \/>/);
  });
});
