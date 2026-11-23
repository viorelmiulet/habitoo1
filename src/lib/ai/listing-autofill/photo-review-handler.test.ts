import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allowed: true, enabled: true, credits: vi.fn(), provider: { id: "mock", model: "mock", supportsTools: false, generate: vi.fn() }, usage: vi.fn(async () => true) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain = { middleware: () => chain, inputValidator: () => chain, handler: (handler: unknown) => handler }; return chain; } }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/lib/listing-check/check.server", () => ({ runListingChecks: async () => mocks.allowed ? [{ propertyId: "p" }] : [] }));
vi.mock("@/lib/ai/features/features.server", () => ({ isAiFeatureEnabled: async () => mocks.enabled }));
vi.mock("@/lib/ai/providers/registry.server", () => ({ resolveAiProvider: () => mocks.provider }));
vi.mock("@/lib/ai/credits/credits.server", () => ({ chargedAiFallback: async (_actor: unknown, _kind: unknown, p: unknown, run: (provider: unknown) => Promise<unknown>) => { mocks.credits(); return { result: await run(p), provider: p, fallbackUsed: false }; } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/ai/usage/tracking.server", () => ({ writeAiUsage: mocks.usage }));
import { reviewListingPhotos } from "./photo-review.functions";
type Call = (input: { data: { propertyId: string; imageIds: string[] }; context: { userId: string; supabase: unknown } }) => Promise<{ ok: boolean }>;
function db() {
  const filters: [string, unknown][] = [];
  const supabase = { from: (table: string) => {
    const rows = [{ id: "photo", storage_path: "org/p/photo.jpg" }];
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, in: () => chain, maybeSingle: async () => ({ data: { organization_id: "org" } }), then: (resolve: (v: unknown) => unknown) => resolve({ data: table === "property_images" ? rows : null, error: null }) }; return chain;
  }, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://storage.example.test/image" } }) }) } };
  return { supabase, filters };
}
beforeEach(() => { mocks.allowed = true; mocks.enabled = true; vi.clearAllMocks(); mocks.provider.generate.mockResolvedValue({ text: JSON.stringify({ photos: [{ index: 0, category: "living", issues: ["person"], duplicate_of: null }] }), toolCalls: [], inputTokens: 1, outputTokens: 1 }); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => new Uint8Array([1]).buffer }))); });
describe("analiza pozelor: acces și consum", () => {
  it("AI dezactivat nu apelează modelul și nu taxează", async () => { mocks.enabled = false; const { supabase } = db(); const result = await (reviewListingPhotos as unknown as Call)({ data: { propertyId: "p", imageIds: ["photo"] }, context: { userId: "agent", supabase } }); expect(result.ok).toBe(false); expect(mocks.provider.generate).not.toHaveBeenCalled(); expect(mocks.credits).not.toHaveBeenCalled(); });
  it("o proprietate a altui agent nu intră în analiză", async () => { mocks.allowed = false; const { supabase } = db(); const result = await (reviewListingPhotos as unknown as Call)({ data: { propertyId: "p", imageIds: ["photo"] }, context: { userId: "agent", supabase } }); expect(result.ok).toBe(false); expect(mocks.provider.generate).not.toHaveBeenCalled(); });
  it("pozele sunt izolate în agenție/proprietate și consumul se înregistrează o dată", async () => { const { supabase, filters } = db(); const result = await (reviewListingPhotos as unknown as Call)({ data: { propertyId: "p", imageIds: ["photo"] }, context: { userId: "agent", supabase } }); expect(result.ok).toBe(true); expect(filters).toContainEqual(["organization_id", "org"]); expect(filters).toContainEqual(["property_id", "p"]); expect(mocks.credits).toHaveBeenCalledTimes(1); expect(mocks.usage).toHaveBeenCalledTimes(1); });
});