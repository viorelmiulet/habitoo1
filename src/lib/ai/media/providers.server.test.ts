import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENHANCE_PROMPT, downloadAiMedia, falQueueApp, mediaConfigured, readAiMediaPrediction, startAiMediaPrediction, validateAiMediaBytes } from "./providers.server";
const request = vi.fn();
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const VIDEO = "fal-ai/kling-video/v2.5-turbo/standard/image-to-video";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
beforeEach(() => { vi.stubGlobal("fetch", request); vi.stubEnv("GEMINI_API_KEY", "test-gemini"); vi.stubEnv("FAL_KEY", "test-fal"); request.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Studio AI: imagini Gemini", () => {
  it("generează o imagine pătrată și întoarce octeții inline ca PNG valid", async () => {
    request.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: "Iată" }, { inlineData: { mimeType: "image/png", data: b64(PNG) } }] } }] }));
    const result = await startAiMediaPrediction({ kind: "marketing_image", prompt: "Living luminos", sourceUrl: null });
    expect(result.status).toBe("succeeded");
    expect(validateAiMediaBytes(result.inline!, "marketing_image")).toMatchObject({ extension: "png", contentType: "image/png" });
    expect(request.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent");
    expect(request.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-gemini");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ contents: [{ role: "user", parts: [{ text: "Living luminos" }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } } });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("JPEG inline este recunoscut ca JPEG", async () => {
    request.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: b64(new Uint8Array([255, 216, 255, 224])) } }] } }] }));
    const result = await startAiMediaPrediction({ kind: "marketing_image", prompt: "x", sourceUrl: null });
    expect(validateAiMediaBytes(result.inline!, "marketing_image").extension).toBe("jpg");
  });
  it("fără imagine în răspuns → mesaj clar", async () => {
    request.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: "Nu pot." }] } }] }));
    await expect(startAiMediaPrediction({ kind: "marketing_image", prompt: "x", sourceUrl: null })).rejects.toMatchObject({ code: "gemini_no_image" });
  });
  it("folosește modelul de imagine salvat", async () => {
    request.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ inlineData: { data: b64(PNG) } }] } }] }));
    await startAiMediaPrediction({ kind: "marketing_image", prompt: "x", sourceUrl: null, model: "gemini-3-image" });
    expect(request.mock.calls[0][0]).toContain("/models/gemini-3-image:generateContent");
  });
});

describe("Studio AI: video fal (coadă asincronă)", () => {
  it("submit → running → succeeded → MP4 descărcat și validat", async () => {
    request.mockResolvedValueOnce(ok({ request_id: "req-1" }));
    expect(await startAiMediaPrediction({ kind: "photo_video", prompt: "Slow move", sourceUrl: "https://private.example/signed" })).toEqual({ id: "req-1", status: "running", outputUrl: null });
    expect(request.mock.calls[0][0]).toBe(`https://queue.fal.run/${VIDEO}`);
    expect(request.mock.calls[0][1].headers.Authorization).toBe("Key test-fal");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ prompt: "Slow move", image_url: "https://private.example/signed", duration: "5" });

    request.mockResolvedValueOnce(ok({ status: "IN_PROGRESS" }));
    expect((await readAiMediaPrediction("req-1", VIDEO)).status).toBe("running");
    expect(request.mock.calls[1][0]).toBe("https://queue.fal.run/fal-ai/kling-video/requests/req-1/status");

    request.mockResolvedValueOnce(ok({ status: "COMPLETED" })).mockResolvedValueOnce(ok({ video: { url: "https://v3.fal.media/out.mp4" } }));
    const done = await readAiMediaPrediction("req-1", VIDEO);
    expect(done).toEqual({ id: "req-1", status: "succeeded", outputUrl: "https://v3.fal.media/out.mp4" });
    expect(request.mock.calls[3][0]).toBe("https://queue.fal.run/fal-ai/kling-video/requests/req-1");

    request.mockResolvedValueOnce(new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])));
    expect(await downloadAiMedia(done.outputUrl!, "photo_video")).toMatchObject({ extension: "mp4", contentType: "video/mp4" });
  });
  it("un fișier care nu e MP4 este refuzat", async () => {
    request.mockResolvedValue(new Response("<html>"));
    await expect(downloadAiMedia("https://v3.fal.media/out.mp4", "photo_video")).rejects.toMatchObject({ message: "Fișierul video primit nu este valid." });
  });
  it("eșec fal la rezultat → status failed", async () => {
    request.mockResolvedValueOnce(ok({ status: "COMPLETED" })).mockResolvedValueOnce(new Response("provider secret", { status: 422 }));
    expect(await readAiMediaPrediction("req-1", VIDEO)).toMatchObject({ status: "failed", errorCode: "fal_status_failed" });
  });
  it("eroare la trimitere → mesaj clar în română, fără corpul furnizorului", async () => {
    request.mockResolvedValue(new Response("secret provider response", { status: 402 }));
    const error = await startAiMediaPrediction({ kind: "photo_video", prompt: "", sourceUrl: "https://private.example/signed" }).catch((e) => e);
    expect(error).toMatchObject({ code: "fal_http_402", message: "Serviciul de generare nu are credit disponibil. Contactează administratorul platformei." });
    expect(String(error.message)).not.toContain("secret");
  });
  it("aplicația din coadă are doar primele două segmente", () => { expect(falQueueApp(VIDEO)).toBe("fal-ai/kling-video"); });
});

describe("Studio AI: îmbunătățire foto și configurare", () => {
  it("îmbunătățirea rămâne pe fal Kontext cu PNG", async () => {
    request.mockResolvedValue(ok({ images: [{ url: "https://media.example/edited.png" }] }));
    expect((await startAiMediaPrediction({ kind: "photo_enhance", prompt: "", sourceUrl: "https://private.example/signed" })).status).toBe("succeeded");
    expect(request.mock.calls[0][0]).toBe("https://fal.run/fal-ai/flux-pro/kontext");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ prompt: DEFAULT_ENHANCE_PROMPT, image_url: "https://private.example/signed", output_format: "png", num_images: 1, safety_tolerance: "2" });
  });
  it.each(["GEMINI_API_KEY", "FAL_KEY"])("Studio cere %s", (key) => {
    expect(mediaConfigured()).toBe(true); vi.stubEnv(key, ""); expect(mediaConfigured()).toBe(false);
  });
  it("funcționează fără cheia MiniMax", () => { expect(mediaConfigured()).toBe(true); });
  it("timeout raportat sigur", async () => {
    request.mockRejectedValue(new DOMException("token=secret", "TimeoutError"));
    await expect(startAiMediaPrediction({ kind: "marketing_image", prompt: "room", sourceUrl: null })).rejects.toMatchObject({ code: "gemini_timeout" });
  });
  it("un document HTML nu e salvat ca imagine", async () => {
    request.mockResolvedValue(new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(downloadAiMedia("https://media.example/image", "marketing_image")).rejects.toMatchObject({ code: "download_invalid" });
  });
  it("cheia MiniMax nu mai este citit nicăieri în src/", () => {
    const needle = ["MINIMAX", "API", "KEY"].join("_");
    const hits: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, "utf8").includes(needle)) hits.push(p); } };
    walk(join(process.cwd(), "src"));
    expect(hits).toEqual([]);
  });
});
