import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { withAiCredits } from "./credits.server";
import { AiCreditsExhaustedError, romaniaMonthStart, shouldWarnAiCredits } from "./credits";
import { safeAiProviderMessage } from "@/lib/ai/providers/types";

function client(reserveError: string | null = null) {
  const calls: { name: string; args: Record<string, unknown> | undefined }[] = [];
  return {
    calls,
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "ai_credit_reserve") return reserveError ? { data: null, error: { message: reserveError } } : { data: "res-1", error: null };
      return { data: null, error: null };
    }),
  };
}
const actor = { organizationId: "org", userId: "user" };

describe("rezervarea creditelor în jurul apelului AI", () => {
  it("consumă creditele la succes", async () => {
    const c = client();
    await expect(withAiCredits(actor, "text_fast", async () => "ok", { client: c })).resolves.toBe("ok");
    expect(c.calls.map((x) => x.name)).toEqual(["ai_credit_reserve", "ai_credit_settle"]);
    expect(c.calls[1].args).toEqual({ p_id: "res-1", p_success: true });
  });

  it("restituie creditele când apelul eșuează", async () => {
    const c = client();
    await expect(withAiCredits(actor, "text_standard", async () => { throw new Error("provider down"); }, { client: c })).rejects.toThrow("provider down");
    expect(c.calls[1].args).toEqual({ p_id: "res-1", p_success: false });
  });

  it("restituie creditele când rezultatul nu este valid", async () => {
    const c = client();
    await withAiCredits(actor, "text_standard", async () => ({ failure: "x" }), { client: c, isSuccess: (r) => r.failure === null });
    expect(c.calls[1].args).toEqual({ p_id: "res-1", p_success: false });
  });

  it("credite epuizate: apelul nu pornește și utilizatorul vede mesajul cerut", async () => {
    const c = client("ai_credits_exhausted:300:300:2026-12-01");
    const run = vi.fn(async () => "never");
    const error = await withAiCredits(actor, "text_fast", run, { client: c }).catch((e) => e);
    expect(run).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(AiCreditsExhaustedError);
    expect(safeAiProviderMessage(error)).toBe(
      "Ai folosit creditele AI incluse luna aceasta (300/300). Se resetează pe 1 decembrie. Administratorul agenției poate solicita credite suplimentare.",
    );
  });
});

describe("limitele creditelor", () => {
  it("bannerul apare de la 80% consum", () => {
    expect(shouldWarnAiCredits({ used: 239, limit: 300 })).toBe(false);
    expect(shouldWarnAiCredits({ used: 240, limit: 300 })).toBe(true);
  });

  it("luna începe la miezul nopții, ora României", () => {
    expect(romaniaMonthStart(new Date("2026-11-30T21:59:59Z"))).toBe("2026-11-01");
    expect(romaniaMonthStart(new Date("2026-11-30T22:00:00Z"))).toBe("2026-12-01");
  });

  it("scanarea actelor de identitate din Contracte nu consumă credite", () => {
    const source = readFileSync("src/lib/contracts/identity-scan.functions.ts", "utf8");
    expect(source).not.toMatch(/withAiCredits|chargedAiFallback|ai_credit_reserve|checkAiQuota/);
  });

  it("credite epuizate: potrivirea deterministă merge în continuare", async () => {
    const c = client("ai_credits_exhausted:300:300:2026-12-01");
    await expect(withAiCredits(actor, "text_fast", async () => "x", { client: c })).rejects.toBeInstanceOf(AiCreditsExhaustedError);
    const { scoreMatch } = await import("@/lib/matching");
    const result = scoreMatch(
      { kind: "buy", budget_min: null, budget_max: 200000, cities: ["Cluj-Napoca"], areas: [], rooms_min: 2, rooms_max: 3, surface_min: null, features: [], property_type: null } as never,
      { transaction_kind: "sale", price: 150000, city: "Cluj-Napoca", zone: null, rooms: 2, surface_useful: 60, features: [], property_type: "apartment" } as never,
    );
    expect(JSON.stringify(result)).not.toContain("credite");
    expect(result).toBeTruthy();
    expect(readFileSync("src/lib/matching.ts", "utf8")).not.toMatch(/credits|ai_credit/);
  });
});
