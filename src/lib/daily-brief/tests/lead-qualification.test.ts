import { it, expect } from "vitest";
import { buildHomeActions, selectActions, applyAiOrder } from "../actions";
const now = new Date("2026-11-23T12:00:00Z");
const base = { now, scope: "agent-a", leads: [{ id: "lead-a", assigned_to: "agent-a", stage: "contacted", created_at: "2026-11-23T11:00:00Z", property_id: "prop-a", source: "storia" }], requests: [], properties: [], activities: [], events: [], matches: [], checks: [], listings: [], contracts: [], proposals: [], map: [] };
it("lead-ul peste 70 intră în Top acțiuni cu motiv și acțiune directă", () => {
  const actions = selectActions(buildHomeActions({ ...base, leadScores: [{ lead_id: "lead-a", score: 71, score_reason: "Solicită vizionare" }] }), [], now);
  expect(actions[0]).toMatchObject({ kind: "qualified_lead", search: { lead: "lead-a" }, reason: "Scor 71/100 · Solicită vizionare" });
});
it("70 nu trece pragul; AI oprit nu furnizează scoruri; alt agent sau lead închis nu apare", () => {
  expect(buildHomeActions({ ...base, leadScores: [{ lead_id: "lead-a", score: 70, score_reason: "Motiv" }] })).toHaveLength(0);
  expect(buildHomeActions(base)).toHaveLength(0);
  expect(buildHomeActions({ ...base, scope: "agent-b", leadScores: [{ lead_id: "lead-a", score: 95, score_reason: "Motiv" }] })).toHaveLength(0);
  expect(buildHomeActions({ ...base, leads: [{ ...base.leads[0], stage: "won" }], leadScores: [{ lead_id: "lead-a", score: 95, score_reason: "Motiv" }] })).toHaveLength(0);
});
it("ordonarea AI nu coboară lead-ul prioritar sub alte acțiuni", () => {
  const leads = [...base.leads, { id: "lead-b", assigned_to: "agent-a", stage: "new", created_at: "2026-11-23T08:00:00Z", property_id: "prop-b", source: "site" }];
  const actions = selectActions(buildHomeActions({ ...base, leads, leadScores: [{ lead_id: "lead-a", score: 90, score_reason: "Buget și vizionare" }] }), [], now);
  expect(applyAiOrder(actions, { ids: [...actions].reverse().map(a => a.id), recommendation: "Contactează" }).actions[0]?.kind).toBe("qualified_lead");
});