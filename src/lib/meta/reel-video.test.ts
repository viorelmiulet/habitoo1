import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectReelVideo } from "./reel-video";
import { reelVideoError } from "./post-core";

describe("metadate Reel din MP4 real", () => {
  it("citește 9:16 și 3 secunde din fișier, nu din metadatele clientului", async () => {
    const bytes = await readFile(new URL("./fixtures/reel-vertical.mp4", import.meta.url));
    const file = new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
    const info = await inspectReelVideo(file);
    expect(info.width).toBe(90);
    expect(info.height).toBe(160);
    expect(info.duration).toBeCloseTo(3, 2);
    expect(reelVideoError(info, file)).toBeNull();
  });
  it("respinge un fișier invalid chiar dacă MIME pretinde MP4", async () => {
    await expect(inspectReelVideo(new Blob(["not mp4"], { type: "video/mp4" }))).rejects.toThrow();
  });
});