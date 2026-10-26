import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AI_MEDIA_MODELS, DEFAULT_ENHANCE_PROMPT, downloadAiMedia, mediaConfigured, readAiMediaPrediction, startAiMediaPrediction } from "./providers.server";
const request = vi.fn();
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.stubGlobal("fetch", request); vi.stubEnv("MINIMAX_API_KEY", "test-minimax"); vi.stubEnv("FAL_KEY", "test-fal"); request.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Studio AI official provider contracts", () => {
  it("generates exactly one square image synchronously with MiniMax", async () => {
    request.mockResolvedValue(ok({ base_resp: { status_code: 0 }, data: { image_urls: ["https://media.example/image.jpg"] } }));
    expect(await startAiMediaPrediction({ kind: "marketing_image", prompt: "Square room", sourceUrl: null })).toEqual({ id: null, status: "succeeded", outputUrl: "https://media.example/image.jpg" });
    expect(request.mock.calls[0][0]).toBe("https://api.minimax.io/v1/image_generation");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ model: "image-01", prompt: "Square room", aspect_ratio: "1:1", response_format: "url", n: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("starts Fast video at 768P for 6 seconds with the signed first frame, without polling", async () => {
    request.mockResolvedValue(ok({ base_resp: { status_code: 0 }, task_id: "task-123" }));
    expect(await startAiMediaPrediction({ kind: "photo_video", prompt: "Slow move", sourceUrl: "https://private.example/signed" })).toEqual({ id: "task-123", status: "running", outputUrl: null });
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ model: "MiniMax-Hailuo-2.3-Fast", prompt: "Slow move", first_frame_image: "https://private.example/signed", resolution: "768P", duration: 6 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("upgrades HTTP image CDN links to HTTPS", async () => {
    request.mockResolvedValue(ok({ base_resp: { status_code: 0 }, data: { image_urls: ["http://media.example/image.jpg"] } }));
    expect((await startAiMediaPrediction({ kind: "marketing_image", prompt: "room", sourceUrl: null })).outputUrl).toBe("https://media.example/image.jpg");
  });
  it.each(["Preparing", "Queueing", "Processing"])("queries %s once, without retrieving files", async status => {
    request.mockResolvedValue(ok({ base_resp: { status_code: 0 }, status }));
    expect((await readAiMediaPrediction("123")).status).toBe("running");
    expect(request.mock.calls[0][0]).toBe("https://api.minimax.io/v1/query/video_generation?task_id=123");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("retrieves successful video by file_id", async () => {
    request.mockResolvedValueOnce(ok({ base_resp: { status_code: 0 }, status: "Success", file_id: "123456789123456789" })).mockResolvedValueOnce(ok({ base_resp: { status_code: 0 }, file: { download_url: "https://media.example/video.mp4" } }));
    expect((await readAiMediaPrediction("task")).outputUrl).toBe("https://media.example/video.mp4");
    expect(request.mock.calls[1][0]).toBe("https://api.minimax.io/v1/files/retrieve?file_id=123456789123456789");
  });
  it("preserves the enhancement prompt and uses direct fal Kontext with PNG", async () => {
    request.mockResolvedValue(ok({ images: [{ url: "https://media.example/edited.png" }] }));
    expect((await startAiMediaPrediction({ kind: "photo_enhance", prompt: "", sourceUrl: "https://private.example/signed" })).status).toBe("succeeded");
    expect(request.mock.calls[0][0]).toBe("https://fal.run/fal-ai/flux-pro/kontext");
    expect(request.mock.calls[0][1].headers.Authorization).toBe("Key test-fal");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ prompt: DEFAULT_ENHANCE_PROMPT, image_url: "https://private.example/signed", output_format: "png", num_images: 1, safety_tolerance: "2" });
  });
  it.each(["MINIMAX_API_KEY", "FAL_KEY"])("requires %s to mark Studio configured", key => {
    expect(mediaConfigured()).toBe(true); vi.stubEnv(key, ""); expect(mediaConfigured()).toBe(false);
  });
  it.each([401, 402, 429, 500])("sanitizes fal HTTP %s and reports its code", async status => {
    request.mockResolvedValue(new Response("secret provider response", { status }));
    await expect(startAiMediaPrediction({ kind: "photo_enhance", prompt: "", sourceUrl: "https://private.example/signed" })).rejects.toMatchObject({ code: `fal_http_${status}` });
  });
  it("reports a direct-call timeout safely", async () => {
    request.mockRejectedValue(new DOMException("token=secret", "TimeoutError"));
    await expect(startAiMediaPrediction({ kind: "marketing_image", prompt: "room", sourceUrl: null })).rejects.toMatchObject({ code: "minimax_timeout" });
  });
  it("handles MiniMax terminal task failure", async () => {
    request.mockResolvedValue(ok({ base_resp: { status_code: 0 }, status: "Fail" }));
    expect(await readAiMediaPrediction("task")).toMatchObject({ status: "failed", errorCode: "minimax_status_failed" });
  });
  it("detects the real JPEG extension rather than mislabeling MiniMax images as PNG", async () => {
    request.mockResolvedValue(new Response(new Uint8Array([255, 216, 255]), { headers: { "Content-Type": "image/jpeg" } }));
    expect(await downloadAiMedia("https://media.example/image", "marketing_image")).toMatchObject({ extension: "jpg", contentType: "image/jpeg" });
  });
  it("never saves an HTML error document as a generated image", async () => {
    request.mockResolvedValue(new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(downloadAiMedia("https://media.example/image", "marketing_image")).rejects.toMatchObject({ code: "download_invalid" });
  });
});