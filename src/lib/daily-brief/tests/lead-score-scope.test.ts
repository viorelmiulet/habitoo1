import { beforeEach, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(async () => true) }));
vi.mock("@/lib/ai/features/features.server", () => ({ isAiFeatureEnabled: mocks.enabled }));
import { loadDailyBrief } from "../data.server";
beforeEach(() => mocks.enabled.mockResolvedValue(true));
function db() {
  const calls: string[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    leads: [{ id: "own", organization_id: "org", assigned_to: "agent", deleted_at: null, stage: "contacted", created_at: "2026-11-23T09:00:00Z" }, { id: "other", organization_id: "org", assigned_to: "other-agent", deleted_at: null, stage: "contacted", created_at: "2026-11-23T09:00:00Z" }],
    lead_ai_insights: [{ id: "i1", organization_id: "org", lead_id: "own", status: "done", score: 95, score_reason: "Vizionare", updated_at: "2026-11-23" }, { id: "i2", organization_id: "org", lead_id: "other", status: "done", score: 99, score_reason: "Alt agent", updated_at: "2026-11-23" }, { id: "i3", organization_id: "foreign", lead_id: "own", status: "done", score: 99, score_reason: "Altă agenție", updated_at: "2026-11-23" }],
  };
  const client = { rpc: async () => ({ data: false, error: null }), from: (table: string) => {
    calls.push(table); let rows = tables[table] ?? [];
    const query = { select: () => query, eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return query; }, is: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return query; }, neq: () => query, order: () => query, range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }) };
    return query;
  } } as unknown as SupabaseClient<Database>;
  return { client, calls };
}
it("Top acțiuni citește scorul prin drepturile apelantului și păstrează agenția/agentul", async () => {
  const { client } = db(); const result = await loadDailyBrief(client, "org", "agent", new Date("2026-11-23T12:00:00Z"));
  expect(result.actions).toHaveLength(1); expect(result.actions[0]?.id).toBe("qualified_lead:own");
  expect(result.actions[0]?.reason).toBe("Scor 95/100 · Vizionare");
});
it("AI oprit: niciun scor prioritar și nicio citire a analizelor", async () => {
  mocks.enabled.mockResolvedValue(false); const { client, calls } = db();
  const result = await loadDailyBrief(client, "org", "agent", new Date("2026-11-23T12:00:00Z"));
  expect(result.actions).toHaveLength(0); expect(calls).not.toContain("lead_ai_insights");
});