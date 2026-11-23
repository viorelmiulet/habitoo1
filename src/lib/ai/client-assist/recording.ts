/** Complete PCM/WAV recording; no media upload, object URL or persistent cache. */
export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  tag(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const value of chunk) { const sample = Math.max(-1, Math.min(1, value)); view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true); offset += 2; }
  return new Blob([bytes], { type: "audio/wav" });
}
export type CallRecorder = { stop: () => Promise<Blob>; cancel: () => Promise<void> };
export async function recordCall(): Promise<CallRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context: AudioContext | undefined;
  try {
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
    const ac = context;
    const source = ac.createMediaStreamSource(stream);
    const node = ac.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    let stopped = false;
    node.onaudioprocess = event => {
      const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
      chunks.push(chunk);
    };
    source.connect(node); node.connect(ac.destination);
    const close = async () => {
      stream.getTracks().forEach(track => track.stop()); node.onaudioprocess = null; node.disconnect(); source.disconnect(); await ac.close();
    };
    const clear = () => { chunks.forEach(chunk => chunk.fill(0)); chunks.length = 0; };
    return {
      async stop() {
        if (stopped) throw new Error("Înregistrarea a fost deja oprită.");
        stopped = true;
        try { const blob = encodeWav(chunks, ac.sampleRate); await close(); if (blob.size < 2048) throw new Error("Înregistrarea este prea scurtă. Încearcă din nou."); return blob; }
        finally { clear(); }
      },
      async cancel() { if (stopped) return; stopped = true; try { await close(); } finally { clear(); } },
    };
  } catch (error) { stream.getTracks().forEach(track => track.stop()); await context?.close(); throw error; }
}

/** Clear local bytes on success and failure, keeping only the returned text proposals. */
export async function withEphemeralAudio<T>(blob: Blob, send: (audio: { base64: string; mimeType: string }) => Promise<T>): Promise<T> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const audio = { base64: "", mimeType: "audio/wav" };
  try {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    audio.base64 = btoa(binary); binary = "";
    return await send(audio);
  } finally { audio.base64 = ""; bytes.fill(0); }
}