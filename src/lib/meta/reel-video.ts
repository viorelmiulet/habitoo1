/** Metadata only: no decoding, works in the browser and Worker. */
import type { ReelVideoInfo } from "./post-core";

export async function inspectReelVideo(file: Blob): Promise<ReelVideoInfo> {
  const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("Video-ul nu conține o pistă video validă.");
    const [width, height, duration] = await Promise.all([
      track.getDisplayWidth(), track.getDisplayHeight(), input.computeDuration(),
    ]);
    return { width, height, duration };
  } catch {
    throw new Error("Video-ul nu poate fi citit. Generează din nou video-ul vertical MP4.");
  } finally {
    input.dispose();
  }
}