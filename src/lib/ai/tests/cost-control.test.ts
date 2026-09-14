/**
 * Teste de control al costului: dimensiunea cererii, dublu-click, limite și
 * contextul minim trimis modelului.
 */
import { describe, expect, it } from "vitest";
import {
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_TOOL_CALLS,
  AI_MAX_TOOL_STEPS,
  AI_RATE_LIMITS,
  isDuplicateAiRequest,
  validateAiRequestSize,
} from "../usage/limits";
import { buildAiContext, AI_CONTEXT_VERSION } from "../context/builder";
import { writeAiUsage } from "../usage/tracking.server";
import { buildAiAuditRow, scrubAuditDetails } from "../security/audit";

describe("dimensiunea cererii", () => {
  it("respinge mesajul gol sau non-text", () => {
    expect(validateAiRequestSize("   ").ok).toBe(false);
    expect(validateAiRequestSize(42).ok).toBe(false);
  });

  it("respinge mesajul prea lung", () => {
    expect(validateAiRequestSize("a".repeat(AI_MAX_MESSAGE_CHARS + 1)).ok).toBe(false);
    expect(validateAiRequestSize("a".repeat(AI_MAX_MESSAGE_CHARS)).ok).toBe(true);
  });
});

describe("dublu-click", () => {
  it("detectează mesajul identic în fereastra scurtă", () => {
    const now = new Date("2026-01-01T10:00:10Z");
    expect(
      isDuplicateAiRequest({ content: "Ce am în Pipera?", createdAt: "2026-01-01T10:00:05Z" }, "Ce am în Pipera?", now),
    ).toBe(true);
  });

  it("nu blochează un mesaj diferit sau vechi", () => {
    const now = new Date("2026-01-01T10:00:10Z");
    expect(
      isDuplicateAiRequest({ content: "Altceva", createdAt: "2026-01-01T10:00:05Z" }, "Ce am?", now),
    ).toBe(false);
    expect(
      isDuplicateAiRequest({ content: "Ce am?", createdAt: "2026-01-01T09:00:00Z" }, "Ce am?", now),
    ).toBe(false);
  });
});

describe("limite", () => {
  it("păstrează limitele configurate", () => {
    expect(AI_RATE_LIMITS.perUserMinute.limit).toBeGreaterThan(0);
    expect(AI_RATE_LIMITS.perOrganizationHour.limit).toBeGreaterThanOrEqual(
      AI_RATE_LIMITS.perUserHour.limit,
    );
    expect(AI_MAX_TOOL_STEPS).toBeLessThanOrEqual(6);
    expect(AI_MAX_TOOL_CALLS).toBeLessThanOrEqual(10);
  });
});

describe("contextul minim", () => {
  it("include doar categoriile cerute și câmpurile permise", () => {
    const context = buildAiContext({
      organizationName: "Agenția A",
      property: { id: "p1", title: "Apartament", internalSecret: "nu trimite" },
    });
    expect(context.contextVersion).toBe(AI_CONTEXT_VERSION);
    expect(context.categories).toEqual(["property"]);
    expect(JSON.stringify(context)).not.toContain("internalSecret");
  });
});

describe("usage și audit", () => {
  it("salvează consumul cu tokenurile disponibile", async () => {
    const inserted: unknown[] = [];
    const ok = await writeAiUsage(
      {
        from: () => ({
          insert: async (row: unknown) => {
            inserted.push(row);
            return { error: null };
          },
        }),
      } as never,
      {
        organization_id: "org",
        user_id: "user",
        provider: "gemini",
        model: "gemini-2.5-flash",
        capability: "chat",
        input_tokens: null,
        output_tokens: 10,
        latency_ms: 120,
        success: true,
        tool_calls: 1,
      },
    );
    expect(ok).toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it("auditul nu conține secrete", () => {
    const scrubbed = scrubAuditDetails({
      apiKey: "secret",
      token: "secret",
      tool: "get_property",
    });
    expect(JSON.stringify(scrubbed)).not.toContain("secret");
    const row = buildAiAuditRow({
      organizationId: "org",
      actorId: "user",
      action: "ai.chat.request",
      details: { apiKey: "secret" },
    });
    expect(JSON.stringify(row)).not.toContain("secret");
  });
});
