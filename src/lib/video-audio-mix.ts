export const DUCKED_MUSIC_GAIN = 0.18;
export function musicGainAt(time: number, voiceSeconds: number, total: number): number {
  const duck = voiceSeconds > 0 && time < voiceSeconds ? DUCKED_MUSIC_GAIN : voiceSeconds > 0 && time < voiceSeconds + 0.35 ? DUCKED_MUSIC_GAIN + (1 - DUCKED_MUSIC_GAIN) * ((time - voiceSeconds) / 0.35) : 1;
  return duck * Math.min(1, Math.max(0, (total - time) / 2));
}
/** Shared offline mix for MP4 and MediaRecorder, including voice-only clips. */
export async function mixVideoAudio(music: Blob | null, narration: Blob | null, total: number): Promise<AudioBuffer | null> {
  if (!music && !narration) return null;
  const decoder = new AudioContext();
  let musicData: AudioBuffer | null = null, voiceData: AudioBuffer | null = null;
  try {
    if (music) musicData = await decoder.decodeAudioData(await music.arrayBuffer());
    if (narration) voiceData = await decoder.decodeAudioData(await narration.arrayBuffer());
  } finally { await decoder.close(); }
  if (voiceData && voiceData.duration > total + 0.1) throw new Error("Narațiunea este mai lungă decât clipul. Scurtează textul sau mărește durata clipului.");
  const sampleRate = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  if (musicData) {
    const src = off.createBufferSource(); src.buffer = musicData; src.loop = true;
    const gain = off.createGain();
    const points = new Set([0, Math.max(0, total - 2), total]);
    if (voiceData) { points.add(Math.min(total, voiceData.duration)); points.add(Math.min(total, voiceData.duration + 0.35)); }
    for (let t = 0.05; t < total; t += 0.05) points.add(t);
    for (const t of [...points].sort((a, b) => a - b)) gain.gain.linearRampToValueAtTime(musicGainAt(t, voiceData?.duration ?? 0, total), t);
    src.connect(gain).connect(off.destination); src.start(); src.stop(total);
  }
  if (voiceData) { const src = off.createBufferSource(); src.buffer = voiceData; src.connect(off.destination); src.start(); }
  return off.startRendering();
}