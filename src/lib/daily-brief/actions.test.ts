import { describe, expect, it } from "vitest";
import { assembleBrief } from "./brief";

describe("acțiuni Azi din date simulate", () => {
  it("construiește linkurile și selectează top 5 fără acces la date reale sau AI", () => {
    const result = assembleBrief({
      now: new Date("2026-11-15T08:00:00Z"),
      activities: [{ id: "visit", title: "Vizionare apartament", kind: "viewing", starts_at: "2026-11-15T10:00:00Z" }, { id: "call", title: "Apel", kind: "call", starts_at: "2026-11-15T11:00:00Z" }],
      leads: [{ id: "lead", name: "Client fictiv", stage: "new", created_at: "2026-11-14T08:00:00Z", next_followup_at: "2026-11-14T12:00:00Z", last_interaction_at: null }],
      stagnantIds: [],
      properties: [{ id: "property", title: "Apartament fictiv", price: 80000, description: "Descriere", created_at: "2026-11-01T08:00:00Z", assigned_to: "agent" }],
      imagePropertyIds: ["property"],
      portalErrors: [{ property_id: "property", portal_key: "portal", created_at: "2026-11-14T09:00:00Z" }],
      matches: [{ id: "match", request_id: "request", score: 90, created_at: "2026-11-15T07:00:00Z" }],
      reports: [{ id: "report", property_id: "property", created_at: "2026-11-10T08:00:00Z" }],
      team: [{ userId: "agent", name: "Agent fictiv", inactive: true, portalErrors: 1 }],
    });
    expect(result.counts).toEqual({ overdue: 1, new_lead: 1, viewing: 1, portal_error: 1, stagnant: 0, match: 1, owner_report: 1, incomplete: 0, activitiesToday: 2 });
    expect(result.actions.map(a => a.kind)).toEqual(["overdue", "new_lead", "viewing", "portal_error", "match"]);
    expect(result.actions[0]).toMatchObject({ to: "/app/leads", search: { lead: "lead" } });
    expect(result.actions[2]).toMatchObject({ to: "/app/activities", search: { q: "Vizionare apartament", period: "today" } });
    expect(result.actions[3]).toMatchObject({ to: "/app/properties/property", search: { tab: "publishing" } });
    expect(result.actions[4]?.to).toBe("/app/requests/request");
    expect(result.team).toEqual([{ userId: "agent", name: "Agent fictiv", inactive: true, portalErrors: 1 }]);
  });
});