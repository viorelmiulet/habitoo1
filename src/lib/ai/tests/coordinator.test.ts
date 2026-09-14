/**
 * Coordinatorul Habitoo AI: bucla model → tool autorizat → model → răspuns,
 * plus refuzul tool-urilor neautorizate și trasarea pașilor.
 */
import { describe, expect, it, vi } from "vitest";
import { runCoordinator } from "../agent/coordinator.server";
import { AiTracer } from "../tracing/trace";
import { aiToolDeclarations } from "../tools/registry";
import { AiProviderError, type AIProvider } from "../providers/types";
import type { AiActor } from "../gateway/types";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

const actor: AiActor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: "11111111-1111-4111-8111-111111111111",
  role: "agent",
};

function tracer() {
  return new AiTracer("trace-x", { organizationId: actor.organizationId, userId: actor.userId });
}

function provider(steps: Parameters<AIProvider["generate"]> extends never ? never : unknown[]) {
  let call = 0;
  return {
    id: "fake",
    model: "fake-1",
    supportsTools: true,
    generate: vi.fn(async () => {
      const step = steps[call] as {
        text: string;
        toolCalls: { name: string; arguments: Record<string, unknown> }[];
      };
      call += 1;
      return { ...step, inputTokens: 10, outputTokens: 5 };
    }),
  } as AIProvider;
}

describe("habitooCoordinator", () => {
  it("execută un READ tool autorizat și răspunde", async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      data: [{ id: "p1" }],
      sources: [{ type: "property" as const, id: "p1", label: "HB-1001" }],
      summary: "1 proprietăți",
      capability: "read:properties",
    }));
    const trace = tracer();
    const result = await runCoordinator({
      actor,
      provider: provider([
        { text: "", toolCalls: [{ name: "search_properties", arguments: { query: "Cluj" } }] },
        { text: "Ai o proprietate în Cluj.", toolCalls: [] },
      ]),
      system: "reguli",
      messages: [{ role: "user", content: "ce am în Cluj?" }],
      declarations: aiToolDeclarations(),
      tracer: trace,
      tools: { search_properties: { id: "search_properties", execute } },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe("Ai o proprietate în Cluj.");
    expect(result.toolCalls[0]).toMatchObject({ name: "search_properties", ok: true });
    expect(result.sources[0]?.id).toBe("p1");
    expect(trace.summary().path).toContain("tool:search_properties");
  });

  it("refuză un tool inexistent cerut de model, fără să-l execute", async () => {
    const execute = vi.fn();
    const result = await runCoordinator({
      actor,
      provider: provider([
        { text: "", toolCalls: [{ name: "delete_property", arguments: { id: "x" } }] },
        { text: "Nu pot face asta.", toolCalls: [] },
      ]),
      system: "reguli",
      messages: [{ role: "user", content: "șterge proprietatea" }],
      declarations: aiToolDeclarations(),
      tracer: tracer(),
      tools: { delete_property: { id: "delete_property", execute } },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({ ok: false, error: "unknown_tool" });
  });

  it("întoarce un mesaj sigur când providerul eșuează definitiv", async () => {
    const failing = {
      id: "fake",
      model: "fake-1",
      supportsTools: true,
      generate: vi.fn(async () => {
        throw new AiProviderError("boom", 401, false);
      }),
    } as AIProvider;
    const result = await runCoordinator({
      actor,
      provider: failing,
      system: "reguli",
      messages: [{ role: "user", content: "salut" }],
      declarations: aiToolDeclarations(),
      tracer: tracer(),
      tools: {},
    });
    expect(result.answer).toBe("");
    expect(result.failure).toContain("AI nu este configurat corect");
    expect(failing.generate).toHaveBeenCalledTimes(1);
  });

  it("reîncearcă un eșec tranzitoriu de provider", async () => {
    let calls = 0;
    const flaky = {
      id: "fake",
      model: "fake-1",
      supportsTools: true,
      generate: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new AiProviderError("timeout", 504, true);
        return { text: "gata", toolCalls: [], inputTokens: 1, outputTokens: 1 };
      }),
    } as AIProvider;
    const result = await runCoordinator({
      actor,
      provider: flaky,
      system: "reguli",
      messages: [{ role: "user", content: "salut" }],
      declarations: aiToolDeclarations(),
      tracer: tracer(),
      tools: {},
    });
    expect(calls).toBe(2);
    expect(result.answer).toBe("gata");
  });
});
