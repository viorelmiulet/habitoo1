/**
 * Teste comportamentale pentru reparațiile critice din audit:
 * limite fail-closed, plafon pe agenție, nume interzise la execuție,
 * redactare recursivă.
 */
import { describe, expect, it } from "vitest";
import {
  checkAiQuota,
  checkAiRateLimits,
  readAiOrgUsage,
} from "../gateway/gateway.server";
import { AI_ORG_USAGE_CEILING, evaluateAiOrgCeiling } from "../usage/limits";
import { executeAiTool } from "../tools/executors.server";
import { HIGH_RISK_ACTIONS, isForbiddenAiTool } from "../security/policy";
import { AI_FORBIDDEN_TOOL_NAMES } from "../tools/registry";
import { buildAiAuditRow } from "../security/audit";
import { AiTracer } from "../tracing/trace";
import type { AiActor } from "../gateway/types";

const actor: AiActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  organizationId: "22222222-2222-2222-2222-222222222222",
  role: "admin",
};

function usageClient(rows: { input_tokens: number | null; output_tokens: number | null }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ gte: async () => ({ data: rows, error: null }) }),
      }),
    }),
  };
}

describe("limite de rată fail closed", () => {
  it("refuză cererea când RPC-ul întoarce eroare", async () => {
    const admin = {
      rpc: async () => ({ data: null, error: { message: "db down" } }),
    };
    expect(await checkAiRateLimits(admin, actor, "chat")).toBe(false);
  });

  it("refuză cererea când rezultatul nu este boolean", async () => {
    const admin = { rpc: async () => ({ data: null, error: null }) };
    expect(await checkAiRateLimits(admin, actor, "chat")).toBe(false);
  });

  it("refuză cererea când RPC-ul aruncă", async () => {
    const admin = {
      rpc: async () => {
        throw new Error("network");
      },
    };
    expect(await checkAiRateLimits(admin, actor, "chat")).toBe(false);
  });

  it("permite cererea când RPC-ul răspunde true", async () => {
    const admin = { rpc: async () => ({ data: true, error: null }) };
    expect(await checkAiRateLimits(admin, actor, "chat")).toBe(true);
  });
});

describe("plafonul de consum pe agenție", () => {
  it("blochează pe număr de cereri, cu mesaj despre agenție", async () => {
    const rows = Array.from({ length: AI_ORG_USAGE_CEILING.maxRequests }, () => ({
      input_tokens: 1,
      output_tokens: 1,
    }));
    const admin = { rpc: async () => ({ data: true, error: null }), ...usageClient(rows) };
    const decision = await checkAiQuota(admin as never, actor, "chat");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.message).toContain("Agenția a atins limita de consum AI");
  });

  it("blochează pe tokeni", () => {
    const decision = evaluateAiOrgCeiling({
      requests: 1,
      tokens: AI_ORG_USAGE_CEILING.maxTokens,
      unknownTokenRequests: 0,
    });
    expect(decision.exceeded).toBe(true);
  });

  it("nu tratează tokenii necunoscuți drept zero: cererea se numără și e marcată", async () => {
    const snapshot = await readAiOrgUsage(
      usageClient([
        { input_tokens: null, output_tokens: null },
        { input_tokens: 10, output_tokens: 5 },
      ]) as never,
      actor.organizationId,
    );
    expect(snapshot).toEqual({ requests: 2, tokens: 15, unknownTokenRequests: 1 });
  });

  it("permite cererea sub plafon", async () => {
    const admin = {
      rpc: async () => ({ data: true, error: null }),
      ...usageClient([{ input_tokens: 10, output_tokens: 10 }]),
    };
    expect((await checkAiQuota(admin as never, actor, "chat")).allowed).toBe(true);
  });
});

describe("nume interzise la execuție", () => {
  it("listele sunt o singură sursă de adevăr, cu numele divergente reconciliate", () => {
    expect(AI_FORBIDDEN_TOOL_NAMES).toBe(HIGH_RISK_ACTIONS);
    for (const name of [
      "publish_portal",
      "publish_to_portal",
      "create_contract",
      "sign_contract",
      "change_price",
    ]) {
      expect(isForbiddenAiTool(name)).toBe(true);
    }
  });

  it("refuză înainte de orice interogare", async () => {
    for (const name of AI_FORBIDDEN_TOOL_NAMES) {
      const result = await executeAiTool(actor, name, {});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("denied");
    }
  });
});

describe("redactare recursivă", () => {
  const details = {
    tool: "get_property",
    nested: {
      level2: {
        apiKey: "AIzaSecret",
        authorization: "Bearer abc",
        keep: "ok",
        deeper: [{ password: "p", label: "L" }],
      },
    },
    long: "x".repeat(1000),
  };

  it("nu lasă secrete nested în audit_logs", () => {
    const row = buildAiAuditRow({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "ai.tool.executed",
      details,
    });
    const serialized = JSON.stringify(row?.new_values);
    expect(serialized).not.toContain("AIzaSecret");
    expect(serialized).not.toContain("Bearer abc");
    expect(serialized).not.toContain("\"password\"");
    expect(serialized).toContain("ok");
    expect(serialized).not.toContain("x".repeat(400));
  });

  it("nu lasă secrete nested în ai_trace_events", () => {
    const tracer = new AiTracer("trace-1", {
      organizationId: actor.organizationId,
      userId: actor.userId,
    });
    tracer.record("tool", "get_property", { details });
    const serialized = JSON.stringify(tracer.list());
    expect(serialized).not.toContain("AIzaSecret");
    expect(serialized).not.toContain("Bearer abc");
    expect(serialized).not.toContain("\"password\"");
    expect(serialized).toContain("L");
  });
});

describe("scurtarea apelurilor de instrumente", () => {
  it("limitează argumentele și rezultatul", async () => {
    const { truncateAiToolCall, AI_TOOL_ARGUMENTS_MAX_CHARS } = await import("../gateway/types");
    const record = truncateAiToolCall({
      name: "get_property",
      arguments: JSON.stringify({ q: "y".repeat(5000) }),
      ok: true,
      durationMs: 1,
      summary: "z".repeat(5000),
    });
    expect(record.arguments.length).toBeLessThanOrEqual(AI_TOOL_ARGUMENTS_MAX_CHARS + 1);
    expect(record.summary.length).toBeLessThanOrEqual(501);
  });
});
