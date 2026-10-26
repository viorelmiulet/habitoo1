import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaProviderError } from "./providers.server";
const mocks = vi.hoisted(() => ({ start: vi.fn(), read: vi.fn(), download: vi.fn() }));
vi.mock("./providers.server", async importOriginal => ({ ...await importOriginal<typeof import("./providers.server")>(), startAiMediaPrediction: mocks.start, readAiMediaPrediction: mocks.read, downloadAiMedia: mocks.download }));
import { refreshMediaGeneration, startMediaGeneration } from "./generation.server";
function fixture() {
  const rows: any[] = [], events: any[] = [];
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const storage = { from: () => ({ upload, remove, createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://private.example/signed" }, error: null }) }) };
  const insertGate = vi.fn().mockReturnValue(null);
  const client = { storage, from: (table: string) => {
    const target = table === "ai_usage_events" ? events : rows;
    let operation: string, values: any, filters: [string, unknown][] = [];
    const matches = (r: any) => filters.every(([k, v]) => k === "extra_info->>generation_id" ? r.extra_info?.generation_id === v : r[k] === v);
    const execute = () => {
      if (operation === "insert") { if (table === "ai_media_generations") { const error = insertGate(values); if (error) return { data: null, error }; } const row = { id: `row-${target.length}`, created_at: new Date().toISOString(), ...values }; target.push(row); return { data: row, error: null }; }
      const changed = target.filter(matches); changed.forEach(r => Object.assign(r, values)); return { data: changed.map(r => ({ ...r })), error: null };
    };
    const q: any = { insert: (v: any) => { operation = "insert"; values = v; return q; }, update: (v: any) => { operation = "update"; values = v; return q; }, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; }, select: () => q, single: async () => execute(), then: (resolve: any) => Promise.resolve(execute()).then(resolve) };
    return q;
  } };
  return { context: { supabase: client, userId: "user" }, admin: client, rows, events, upload, remove, insertGate };
}
beforeEach(() => { vi.clearAllMocks(); mocks.download.mockResolvedValue({ bytes: new Uint8Array([137,80,78,71]), extension: "png", contentType: "image/png" }); });
describe("Studio generation rows, private files and one usage event", () => {
  it("does not contact a provider or write usage when the monthly reservation is refused", async () => {
    const f = fixture();
    f.insertGate.mockReturnValue({ message: "ai_media_limit:photo_video:10:2026-10-31 22:00:00+00:10:0" });
    const result = await startMediaGeneration(f.context, f.admin, "org", { kind: "photo_video", prompt: "", sourcePath: "org/source" });
    expect(result.ok).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled(); expect(f.events).toHaveLength(0); expect(f.rows).toHaveLength(0);
  });
  it.each(["marketing_image", "photo_enhance"] as const)("saves %s immediately and records successful usage", async kind => {
    const f = fixture(); mocks.start.mockResolvedValue({ id: null, status: "succeeded", outputUrl: "https://media.example/image" });
    expect((await startMediaGeneration(f.context, f.admin, "org", { kind, prompt: "test", sourcePath: kind === "photo_enhance" ? "org/user/source" : null })).ok).toBe(true);
    expect(f.rows[0]).toMatchObject({ status: "succeeded", output_url: "org/user/row-0.png" });
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(f.events).toHaveLength(1);
    expect(f.events[0]).toMatchObject({ capability: "ai_media", provider: kind === "marketing_image" ? "minimax" : "fal", model: kind === "marketing_image" ? "image-01" : "fal-ai/flux-pro/kontext", success: true });
    expect(f.events[0].latency_ms).toBeGreaterThanOrEqual(0);
  });
  it("stores task_id, then completes video with the same single usage event", async () => {
    const f = fixture(); mocks.start.mockResolvedValue({ id: "minimax-task", status: "running", outputUrl: null });
    await startMediaGeneration(f.context, f.admin, "org", { kind: "photo_video", prompt: "test", sourcePath: "org/user/source" });
    expect(f.rows[0]).toMatchObject({ prediction_id: "minimax-task", status: "running", model: "MiniMax-Hailuo-2.3-Fast" });
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({ id: "minimax-task", status: "succeeded", outputUrl: "https://media.example/video" });
    await refreshMediaGeneration(f.context, f.admin, { ...f.rows[0] });
    expect(f.rows[0].status).toBe("succeeded"); expect(f.events).toHaveLength(1); expect(f.events[0].success).toBe(true);
  });
  it("records provider failure without uploading a file", async () => {
    const f = fixture(); mocks.start.mockRejectedValue(new MediaProviderError("fal_http_401", "Conexiunea trebuie verificată."));
    expect((await startMediaGeneration(f.context, f.admin, "org", { kind: "photo_enhance", prompt: "", sourcePath: "org/user/source" })).ok).toBe(false);
    expect(f.rows[0]).toMatchObject({ status: "failed", output_url: null }); expect(f.upload).not.toHaveBeenCalled();
    expect(f.events).toHaveLength(1); expect(f.events[0]).toMatchObject({ success: false, extra_info: { error_code: "fal_http_401" } });
  });
  it.each(["marketing_image", "photo_enhance", "photo_video"] as const)("does not fail an in-flight %s submission on a concurrent UI refresh", async kind => {
    const f = fixture();
    expect(await refreshMediaGeneration(f.context, f.admin, { id: "in-flight", kind, model: kind === "marketing_image" ? "image-01" : kind === "photo_enhance" ? "fal-ai/flux-pro/kontext" : "MiniMax-Hailuo-2.3-Fast", prediction_id: null })).toEqual({ ok: true });
    expect(mocks.read).not.toHaveBeenCalled(); expect(f.events).toHaveLength(0); expect(f.upload).not.toHaveBeenCalled();
  });
  it("records upload_failed without a succeeded row", async () => {
    const f = fixture(); f.upload.mockResolvedValue({ error: { message: "private details" } }); mocks.start.mockResolvedValue({ id: null, status: "succeeded", outputUrl: "https://media.example/image" });
    await startMediaGeneration(f.context, f.admin, "org", { kind: "marketing_image", prompt: "test", sourcePath: null });
    expect(f.rows[0].status).toBe("failed"); expect(f.events[0].extra_info.error_code).toBe("upload_failed");
  });
  it("rejects cross-agency input before contacting the provider", async () => {
    const f = fixture(); await startMediaGeneration(f.context, f.admin, "org", { kind: "photo_video", prompt: "", sourcePath: "other/user/source" });
    expect(mocks.start).not.toHaveBeenCalled(); expect(f.events[0].extra_info.error_code).toBe("source_invalid");
  });
  it("keeps video running on a transient status error, with a diagnostic code", async () => {
    const f = fixture(); mocks.start.mockResolvedValue({ id: "task", status: "running", outputUrl: null });
    await startMediaGeneration(f.context, f.admin, "org", { kind: "photo_video", prompt: "", sourcePath: "org/user/source" });
    mocks.read.mockRejectedValue(new MediaProviderError("minimax_timeout", "Încearcă din nou.", true));
    await refreshMediaGeneration(f.context, f.admin, { ...f.rows[0] });
    expect(f.rows[0].status).toBe("running"); expect(f.events[0].extra_info.error_code).toBe("minimax_timeout");
  });
});