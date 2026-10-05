import { beforeEach, describe, expect, it, vi } from "vitest";

const orgs: Record<string, { ai_enabled: boolean }> = {};
const features: { organization_id: string; feature_key: string; enabled: boolean }[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, id: string) =>
          table === "organizations"
            ? { maybeSingle: async () => ({ data: orgs[id] ?? null, error: null }) }
            : Promise.resolve({ data: features.filter((f) => f.organization_id === id), error: null }),
      }),
    }),
  },
}));

import { isOrgAiEnabled, loadAiFeatures } from "./features.server";
import { checkAiQuota } from "@/lib/ai/gateway/gateway.server";

const OFF = "00000000-0000-0000-0000-00000000000a";
const ON = "00000000-0000-0000-0000-00000000000b";

beforeEach(() => {
  orgs[OFF] = { ai_enabled: false };
  orgs[ON] = { ai_enabled: true };
  features.length = 0;
  features.push(
    { organization_id: OFF, feature_key: "ai_marketing", enabled: true },
    { organization_id: ON, feature_key: "ai_marketing", enabled: true },
  );
});

describe("comutatorul general AI per agenție", () => {
  it("agenția cu AI dezactivat: toate funcțiile închise și apelul refuzat", async () => {
    expect(await isOrgAiEnabled(OFF)).toBe(false);
    expect((await loadAiFeatures(OFF)).ai_marketing).toBe(false);
    const quota = await checkAiQuota({} as never, { userId: "u", organizationId: OFF } as never);
    expect(quota.allowed).toBe(false);
    expect(quota.message).toMatch(/nu sunt activate/);
  });
  it("agenția activată: funcțiile activate rămân disponibile", async () => {
    expect(await isOrgAiEnabled(ON)).toBe(true);
    expect((await loadAiFeatures(ON)).ai_marketing).toBe(true);
  });
  it("fără agenție sau agenție necunoscută: închis", async () => {
    expect(await isOrgAiEnabled(null)).toBe(false);
    expect(await isOrgAiEnabled("00000000-0000-0000-0000-0000000000ff")).toBe(false);
  });
});
