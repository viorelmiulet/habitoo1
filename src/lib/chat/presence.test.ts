import { describe, expect, it, vi } from "vitest";
import { activityLabel, isOnline, startPresenceHeartbeat } from "./presence";

function fakeDoc(state = "visible") {
  let h: (() => void) | null = null;
  return {
    visibilityState: state,
    addEventListener: (_: string, f: () => void) => (h = f),
    removeEventListener: () => (h = null),
    fire(s: string) { this.visibilityState = s; h?.(); },
  };
}

describe("prezență", () => {
  it("apelurile pornesc cu fila vizibilă și se opresc cu fila ascunsă", () => {
    vi.useFakeTimers();
    const touch = vi.fn();
    const doc = fakeDoc();
    const timers = { set: (f: () => void, ms: number) => setInterval(f, ms), clear: (id: unknown) => clearInterval(id as number) };
    const stop = startPresenceHeartbeat(touch, doc, timers);
    expect(touch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(touch).toHaveBeenCalledTimes(3);
    doc.fire("hidden");
    vi.advanceTimersByTime(300_000);
    expect(touch).toHaveBeenCalledTimes(3);
    doc.fire("visible");
    expect(touch).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(300_000);
    expect(touch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
  it("formatare în ora României", () => {
    const now = Date.parse("2026-10-10T17:00:00Z"); // 20:00 București
    expect(activityLabel(true, null, now)).toBe("Online");
    expect(activityLabel(false, null, now)).toBeNull();
    expect(activityLabel(false, "2026-10-10T16:55:00Z", now)).toBe("Activ acum 5 min");
    expect(activityLabel(false, "2026-10-10T11:32:00Z", now)).toBe("Activ azi la 14:32");
    expect(activityLabel(false, "2026-10-09T15:05:00Z", now)).toBe("Activ ieri la 18:05");
    expect(activityLabel(false, "2026-10-03T10:00:00Z", now)).toBe("Activ pe 3 oct.");
  });
  it("online la realtime sau activitate sub 2 minute", () => {
    const now = Date.parse("2026-10-10T17:00:00Z");
    expect(isOnline(false, "2026-10-10T16:58:30Z", now)).toBe(true);
    expect(isOnline(false, "2026-10-10T16:57:30Z", now)).toBe(false);
    expect(isOnline(true, null, now)).toBe(true);
  });
});
