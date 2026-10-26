import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { YT_STATE_TTL_MS } from "./core";

export type YtState = { organizationId: string; userId: string; exp: number };

export function signYoutubeState(input: { organizationId: string; userId: string }, secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ o: input.organizationId, u: input.userId, exp: now + YT_STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  const sig = createHmac("sha256", `${secret}:yt-state`).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyYoutubeState(state: string | null | undefined, secret: string, now = Date.now()): YtState | null {
  if (!state) return null;
  const [payload, sig, extra] = state.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", `${secret}:yt-state`).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o?: string; u?: string; exp?: number };
    if (typeof p.o !== "string" || typeof p.u !== "string" || typeof p.exp !== "number" || p.exp < now) return null;
    return { organizationId: p.o, userId: p.u, exp: p.exp };
  } catch {
    return null;
  }
}

