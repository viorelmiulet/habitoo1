import { describe, expect, it } from "vitest";
import { buildHomeActions, selectActions, type ActionKind, type HomeAction } from "./actions";

const action = (kind: ActionKind, at = "2026-11-14"): HomeAction => ({ id: kind, entityKey: kind, kind, title: kind, reason: "", to: "/app", button: "", at, agentId: null, source: null, propertyTitle: null, ageHours: 0 });
describe("current daily actions", () => {
  it("uses current priority without truncating the complete action list", () => {
    const result = selectActions([action("map"), action("required"), action("match"), action("viewing"), action("overdue"), action("new_lead")], [], new Date("2026-11-15T08:00:00Z"));
    expect(result.map(a => a.kind)).toEqual(["new_lead", "overdue", "viewing", "match", "required", "map"]);
  });
  it("keeps older actions first within each priority", () => {
    expect(selectActions([{ ...action("overdue", "2026-11-10"), id: "newer", entityKey: "newer" }, action("overdue", "2026-11-01")], [], new Date("2026-11-15"))[0]?.at).toBe("2026-11-01");
  });
  it("builds current links and deduplicates a lead's follow-up behind contact", () => {
    const now = new Date("2026-11-15T08:00:00Z");
    const rows = buildHomeActions({ now, scope: "agent", leads: [{ id: "lead", stage: "new", created_at: "2026-11-14T08:00:00Z", next_followup_at: "2026-11-14T12:00:00Z", last_interaction_at: null, assigned_to: "agent" }], activities: [{ id: "visit", title: "Vizionare apartament", kind: "viewing", starts_at: "2026-11-15T10:00:00Z", assigned_to: "agent" }], requests: [], events: [], properties: [], matches: [], checks: [], listings: [], contracts: [], proposals: [], map: [] });
    const result = selectActions(rows, [], now);
    expect(result.map(a => a.kind)).toEqual(["new_lead", "viewing"]);
    expect(result[0]).toMatchObject({ to: "/app/leads", search: { lead: "lead" } });
    expect(result[1]).toMatchObject({ to: "/app/activities", search: { q: "Vizionare apartament" } });
  });
});