// „Activ ultima dată”: salvarea periodică a activității și formatarea ei (ora României).
export const PRESENCE_INTERVAL_MS = 60_000;
export const ONLINE_WINDOW_MS = 2 * 60_000;
const TZ = "Europe/Bucharest";

type Doc = {
  visibilityState: string;
  addEventListener(t: "visibilitychange", f: () => void): void;
  removeEventListener(t: "visibilitychange", f: () => void): void;
};
type Timers = { set(f: () => void, ms: number): unknown; clear(id: unknown): void };

/** Apelează `touch` la pornire, la fiecare minut cât fila e vizibilă și imediat la revenirea în filă. */
export function startPresenceHeartbeat(
  touch: () => void,
  doc: Doc = document,
  timers: Timers = { set: (f, ms) => window.setInterval(f, ms), clear: (id) => window.clearInterval(id as number) },
): () => void {
  let timer: unknown = null;
  const start = () => {
    if (timer !== null) return;
    touch();
    timer = timers.set(touch, PRESENCE_INTERVAL_MS);
  };
  const stop = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const onVis = () => (doc.visibilityState === "visible" ? start() : stop());
  doc.addEventListener("visibilitychange", onVis);
  onVis();
  return () => {
    stop();
    doc.removeEventListener("visibilitychange", onVis);
  };
}

export function isOnline(inRealtime: boolean, lastSeenAt: string | null, now = Date.now()): boolean {
  return inRealtime || (!!lastSeenAt && now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);
}

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const hm = (d: Date) => new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** Textul de sub nume; null = nu se afișează nimic. */
export function activityLabel(online: boolean, lastSeenAt: string | null, now = Date.now()): string | null {
  if (online) return "Online";
  if (!lastSeenAt) return null;
  const seen = new Date(lastSeenAt);
  const diff = Math.max(0, now - seen.getTime());
  if (diff < 60 * 60_000) return `Activ acum ${Math.max(1, Math.floor(diff / 60_000))} min`;
  const today = dayKey(new Date(now));
  if (dayKey(seen) === today) return `Activ azi la ${hm(seen)}`;
  if (dayKey(seen) === dayKey(new Date(now - 86_400_000))) return `Activ ieri la ${hm(seen)}`;
  return `Activ pe ${new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, day: "numeric", month: "short" }).format(seen)}`;
}
