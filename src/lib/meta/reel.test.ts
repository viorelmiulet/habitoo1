import { describe, expect, it, vi } from "vitest";
import { META_VIDEO_MAX_BYTES, reelVideoError } from "./post-core";
import { facebookReelStatus, publishFacebookReel } from "./reel.server";

vi.mock("./reel-video", () => ({ inspectReelVideo: vi.fn(async () => ({ width: 1080, height: 1920, duration: 10 })) }));
const file = new Blob(["fake video"], { type: "video/mp4" });
const input = { pageId: "page", pageToken: "mock-page-token", file, message: "Oferta\n\nhttps://www.habitoo.ro/oferta/test", onSubmitted: vi.fn(async () => {}) };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("Facebook Reel — fără rețea", () => {
  it("acceptă exclusiv 9:16", () => {
    expect(reelVideoError({ width: 1080, height: 1920, duration: 10 }, file)).toBeNull();
    expect(reelVideoError({ width: 1920, height: 1080, duration: 10 }, file)).not.toBeNull();
    expect(reelVideoError({ width: 1080, height: 1080, duration: 10 }, file)).not.toBeNull();
  });
  it("acceptă durata minimă 3 secunde, nu 2.99", () => {
    expect(reelVideoError({ width: 1080, height: 1920, duration: 3 }, file)).toBeNull();
    expect(reelVideoError({ width: 1080, height: 1920, duration: 2.99 }, file)).not.toBeNull();
  });
  it("acceptă durata maximă 90 secunde, nu 90.01", () => {
    expect(reelVideoError({ width: 1080, height: 1920, duration: 90 }, file)).toBeNull();
    expect(reelVideoError({ width: 1080, height: 1920, duration: 90.01 }, file)).not.toBeNull();
  });
  it("respinge WebM și fișier absent", () => {
    expect(reelVideoError({ width: 1080, height: 1920, duration: 10 }, new Blob(["x"], { type: "video/webm" }))).not.toBeNull();
    expect(reelVideoError(null, null)).not.toBeNull();
  });
  it("limita de fișier este 100 MB inclusiv", () => {
    expect(reelVideoError({ width: 1080, height: 1920, duration: 10 }, { size: META_VIDEO_MAX_BYTES, type: "video/mp4" })).toBeNull();
    expect(reelVideoError({ width: 1080, height: 1920, duration: 10 }, { size: 100 * 1024 * 1024 + 1, type: "video/mp4" })).not.toBeNull();
  });
  it("start → upload binar cu headere → finish → status → permalink", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ video_id: "123", upload_url: "https://rupload.facebook.com/video-upload/v26.0/123" }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ status: { video_status: "ready", publishing_phase: { status: "complete" } } }))
      .mockResolvedValueOnce(json({ permalink_url: "/reel/123" }));
    const onSubmitted = vi.fn(async () => {});
    expect(await publishFacebookReel({ ...input, onSubmitted }, { fetch: f })).toEqual({ status: "published", postId: "123", permalink: "https://www.facebook.com/reel/123" });
    const [start, upload, finish, status] = f.mock.calls;
    expect(start?.[0]).toBe("https://graph.facebook.com/v26.0/page/video_reels");
    expect(String(start?.[1]?.body)).toContain("upload_phase=start");
    expect(upload?.[1]).toMatchObject({ method: "POST", body: file, redirect: "error", headers: { Authorization: "OAuth mock-page-token", offset: "0", file_size: String(file.size), "Content-Type": "application/octet-stream" } });
    const body = finish?.[1]?.body as URLSearchParams;
    expect(body.get("upload_phase")).toBe("finish");
    expect(body.get("video_state")).toBe("PUBLISHED");
    expect(body.get("video_id")).toBe("123");
    expect(body.get("description")).toBe(input.message);
    expect(status?.[0]).toContain("fields=status");
    expect(status?.[1]?.method).toBe("GET");
    expect(onSubmitted).toHaveBeenCalledExactlyOnceWith("123");
  });
  it("nu trimite tokenul la un host de upload străin", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ video_id: "123", upload_url: "https://other.example/upload" }));
    await expect(publishFacebookReel(input, { fetch: f })).rejects.toThrow("adresă validă");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("eroare 190 la start cere reconectare", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: 190, message: "Expired" } }, 400));
    await expect(publishFacebookReel(input, { fetch: f })).rejects.toMatchObject({ kind: "expired", code: 190 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("upload respins oprește finish", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ video_id: "123", upload_url: "https://rupload.facebook.com/upload" }))
      .mockResolvedValueOnce(json({ error: { code: 352, message: "Video invalid" } }, 400));
    await expect(publishFacebookReel(input, { fetch: f })).rejects.toMatchObject({ kind: "rejected", raw: "Video invalid" });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("nu declară publicat doar pentru video ready", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ status: { video_status: "ready", publishing_phase: { status: "in_progress" } } }));
    expect(await facebookReelStatus("123", "T", f)).toBe("processing");
  });
  it("procesarea continuă fără a retrimite start/upload/finish", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ video_id: "123", upload_url: "https://rupload.facebook.com/upload" }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockImplementation(async () => json({ status: { video_status: "processing", publishing_phase: { status: "not_started" } } }));
    expect(await publishFacebookReel(input, { fetch: f, sleep: async () => {}, pollAttempts: 3 })).toMatchObject({ status: "processing", postId: "123" });
    expect(f).toHaveBeenCalledTimes(6);
    expect(f.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
  });
  it("fază de procesare eșuată și conexiune expirată la status", async () => {
    await expect(facebookReelStatus("123", "T", vi.fn<typeof fetch>().mockResolvedValue(json({ status: { processing_phase: { status: "error" } } })))).rejects.toMatchObject({ kind: "rejected" });
    await expect(facebookReelStatus("123", "T", vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: 190 } }, 400)))).rejects.toMatchObject({ kind: "expired" });
  });
  it("finish respins păstrează eroarea Facebook", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ video_id: "123", upload_url: "https://rupload.facebook.com/upload" }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ error: { code: 352, message: "Invalid video format" } }, 400));
    await expect(publishFacebookReel(input, { fetch: f })).rejects.toMatchObject({ kind: "rejected", raw: "Invalid video format" });
  });
});