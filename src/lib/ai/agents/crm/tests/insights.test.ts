import { describe, expect, it } from "vitest";
import {
  leadsWithoutFollowUp,
  priorityLeads,
  scoreLeadPriority,
  stagnantLeads,
  type LeadInsightInput,
} from "../insights";

const NOW = new Date("2026-03-10T10:00:00.000Z");

function lead(overrides: Partial<LeadInsightInput> = {}): LeadInsightInput {
  return {
    id: overrides.id ?? "lead-1",
    name: overrides.name ?? "Ion Popescu",
    stage: overrides.stage ?? "contacted",
    score: overrides.score ?? 0,
    value: overrides.value ?? null,
    source: overrides.source ?? null,
    createdAt: overrides.createdAt ?? "2026-03-01T10:00:00.000Z",
    lastInteractionAt: overrides.lastInteractionAt ?? null,
    nextFollowupAt: overrides.nextFollowupAt ?? null,
    assignedTo: overrides.assignedTo ?? null,
  };
}

describe("scoreLeadPriority", () => {
  it("este determinist și explicabil", () => {
    const input = lead({ lastInteractionAt: "2026-02-01T10:00:00.000Z", value: 250_000 });
    const first = scoreLeadPriority(input, NOW);
    const second = scoreLeadPriority(input, NOW);
    expect(first.priority).toBe(second.priority);
    expect(first.factors.length).toBeGreaterThan(2);
    expect(first.factors.reduce((sum, f) => sum + f.points, 0)).toBeGreaterThanOrEqual(
      first.priority,
    );
  });

  it("nu depășește 100 și nu coboară sub 0", () => {
    const insight = scoreLeadPriority(
      lead({
        stage: "negotiation",
        lastInteractionAt: "2025-01-01T10:00:00.000Z",
        value: 900_000,
        score: 100,
      }),
      NOW,
    );
    expect(insight.priority).toBeLessThanOrEqual(100);
    expect(insight.priority).toBeGreaterThanOrEqual(0);
  });

  it("dă prioritate 0 lead-urilor închise", () => {
    expect(scoreLeadPriority(lead({ stage: "won" }), NOW).priority).toBe(0);
    expect(scoreLeadPriority(lead({ stage: "lost" }), NOW).priority).toBe(0);
  });

  it("marchează follow-up-ul depășit", () => {
    const insight = scoreLeadPriority(lead({ nextFollowupAt: "2026-03-05T10:00:00.000Z" }), NOW);
    expect(insight.followupOverdueDays).toBe(5);
    expect(insight.needsFollowUp).toBe(true);
  });

  it("nu marchează un lead cu follow-up viitor", () => {
    const insight = scoreLeadPriority(lead({ nextFollowupAt: "2026-03-20T10:00:00.000Z" }), NOW);
    expect(insight.needsFollowUp).toBe(false);
  });
});

describe("liste de insight-uri", () => {
  const leads = [
    lead({ id: "a", nextFollowupAt: null, lastInteractionAt: "2026-03-09T10:00:00.000Z" }),
    lead({ id: "b", nextFollowupAt: "2026-03-20T10:00:00.000Z", lastInteractionAt: "2026-02-01T10:00:00.000Z" }),
    lead({ id: "c", stage: "won", nextFollowupAt: null }),
  ];

  it("întoarce doar lead-uri deschise fără follow-up", () => {
    const result = leadsWithoutFollowUp(leads, NOW).map((l) => l.id);
    expect(result).toContain("a");
    expect(result).not.toContain("b");
    expect(result).not.toContain("c");
  });

  it("întoarce lead-uri stagnante după numărul de zile cerut", () => {
    const result = stagnantLeads(leads, 7, NOW).map((l) => l.id);
    expect(result).toEqual(["b"]);
  });

  it("limitează prioritățile și exclude lead-urile închise", () => {
    const result = priorityLeads(leads, 2, NOW);
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result.every((l) => l.priority > 0)).toBe(true);
  });
});
