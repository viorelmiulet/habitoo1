import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ enabled: true, configured: true, foreign: false, reserveError: null as string | null, writes: [] as { table: string; value: any }[], start: vi.fn(), read: vi.fn(), upload: vi.fn(), sign: vi.fn(), rpc: vi.fn() }));
function query(table: string) {
  let write: any = null;
  const value = () => {
    if (table === "profiles") return { organization_id: "org-a" };
    if (table === "properties") return f.foreign ? null : { id: "property-a" };
    if (table === "video_narrations") {
      if (write?.prediction_id === "starting") return { id: "narration-a", usage_event_id: "usage-a" };
      const update = f.writes.filter((w) => w.table === table).at(-1)?.value ?? {};
      return { id: "narration-a", organization_id: "org-a", property_id: "property-a", voice: "female", text: "Apartament", duration_sec: 12, status: "running", prediction_id: "prediction-a", created_at: new Date().toISOString(), usage_event_id: "usage-a", ...update };
    }
    return {};
  };
  const result = () => ({ data: value(), error: null });
  const q: any = { select: () => q, eq: () => q, is: () => q, update: (v: any) => { write = v; f.writes.push({ table, value: v }); return q; }, single: async () => result(), maybeSingle: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve) };
  return q;
}
const client: any = { from: query, storage: { from: () => ({ createSignedUrl: (...args: any[]) => f.sign(...args) }) } };
vi.mock("./ai/features/features.server", () => ({ isAiFeatureEnabled: async () => f.enabled }));
vi.mock("./video-narration-minimax.server", () => ({ narrationConfigured: () => f.configured, generateMiniMaxNarration: (...args: any[]) => f.start(...args) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: query, rpc: (...args: any[]) => f.rpc(...args), storage: { from: () => ({ upload: (...args: any[]) => f.upload(...args) }) } } }));
import { narrationAccess, refreshNarrationCore, startNarrationCore } from "./video-narration.server";

beforeEach(() => { vi.clearAllMocks(); f.enabled = true; f.configured = true; f.foreign = false; f.writes = []; f.rpc.mockResolvedValue({ data: "narration-a", error: null }); f.start.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), usageCharacters: 10 }); f.read.mockResolvedValue({ id: "prediction-a", status: "succeeded", outputUrl: "https://replicate.delivery/audio.mp3" }); f.upload.mockResolvedValue({ error: null }); f.sign.mockResolvedValue({ data: { signedUrl: "https://local.test/private-audio" }, error: null }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))); });
describe("server voce AI", () => {
  it("oprită nu face apel Replicate și nu rezervă consum", async () => { f.enabled = false; await expect(startNarrationCore(client, "user-a", { propertyId: "property-a", requestKey: "key-a", text: "Apartament", voice: "female", seconds: 12 })).rejects.toThrow("nu este activată"); expect(f.start).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled(); });
  it("text prea lung este blocat înainte de consum", async () => { await expect(startNarrationCore(client, "user-a", { propertyId: "property-a", requestKey: "key-a", text: Array(29).fill("cameră").join(" "), voice: "female", seconds: 12 })).rejects.toThrow("limita"); expect(f.rpc).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled(); });
  it("rezervă atomic înaintea apelului și respectă refuzul plafonului", async () => { f.rpc.mockResolvedValue({ data: null, error: { message: "Agenția a atins limita de 20 de generări de voce pe zi." } }); await expect(startNarrationCore(client, "user-a", { propertyId: "property-a", requestKey: "key-a", text: "Apartament", voice: "female", seconds: 12 })).rejects.toThrow("20"); expect(f.start).not.toHaveBeenCalled(); });
  it("succesul salvează audio privat, semnează ca utilizator și înregistrează consumul", async () => { const result = await startNarrationCore(client, "user-a", { propertyId: "property-a", requestKey: "key-a", text: "Apartament", voice: "female", seconds: 12 }); expect(result.status).toBe("succeeded"); expect(result.outputUrl).toBe("https://local.test/private-audio"); expect(f.upload).toHaveBeenCalledWith("org-a/property-a/narration-a.mp3", expect.any(Uint8Array), { contentType: "audio/mpeg", upsert: true }); expect(f.sign).toHaveBeenCalledWith("org-a/property-a/narration-a.mp3", 600); expect(f.writes.some((w) => w.table === "ai_usage_events" && w.value.success === true && w.value.provider === "minimax" && w.value.model === "speech-2.8-turbo" && w.value.extra_info.usage_characters === 10)).toBe(true); });
  it("altă agenție nu poate genera, descărca sau semna fișierul", async () => { f.foreign = true; await expect(narrationAccess(client, "foreign-user", "property-a")).rejects.toThrow("nu este disponibilă"); await expect(refreshNarrationCore(client, "foreign-user", "property-a", "narration-a")).rejects.toThrow("nu este disponibilă"); expect(f.read).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled(); });
  it("lipsa creditului este terminală și păstrează mesajul existent", async () => { f.start.mockRejectedValue(new Error("Generarea vocii a eșuat.")); await expect(startNarrationCore(client, "user-a", { propertyId: "property-a", requestKey: "key-a", text: "Apartament", voice: "male", seconds: 12 })).rejects.toThrow("Generarea vocii a eșuat."); expect(f.start).toHaveBeenCalledTimes(1); expect(f.writes.some((w) => w.value.status === "failed")).toBe(true); });
});