/**
 * Publicare programată pe portal: reguli pure (ora României ↔ UTC, fereastra
 * permisă, afișare). Fără acces la server — folosit și în browser.
 */
export const SCHEDULE_TZ = "Europe/Bucharest";
export const SCHEDULE_MIN_LEAD_MS = 5 * 60_000;
export const SCHEDULE_MAX_AHEAD_MS = 90 * 24 * 60 * 60_000;

/** Diferența (ms) dintre ora României și UTC la momentul dat. */
export function bucharestOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/**
 * „YYYY-MM-DD” + „HH:MM” în ora României → ISO UTC.
 * Ora dublă din noaptea trecerii la ora de iarnă se ia la prima apariție (ora de vară);
 * ora inexistentă de la trecerea la ora de vară se mută înainte cu o oră.
 */
export function bucharestLocalToUtc(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  // Cea mai mare diferență posibilă (vara) dă prima apariție a orei.
  const candidates = [3, 2].map((hours) => wall - hours * 3_600_000);
  for (const utc of candidates) {
    if (utc + bucharestOffsetMs(utc) === wall) return new Date(utc).toISOString();
  }
  // Oră inexistentă (salt de primăvară): aceeași oră locală, cu decalajul de iarnă.
  return new Date(wall - 2 * 3_600_000).toISOString();
}

/** ISO UTC → { date: "YYYY-MM-DD", time: "HH:MM" } în ora României. */
export function utcToBucharestParts(iso: string): { date: string; time: string } {
  const at = new Date(iso).getTime();
  const local = new Date(at + bucharestOffsetMs(at));
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}`,
    time: `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`,
  };
}

/** „14.10.2026, 08:00” în ora României. */
export function formatScheduleLabel(iso: string): string {
  const { date, time } = utcToBucharestParts(iso);
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}, ${time}`;
}

/** null = ora e permisă; altfel motivul refuzului. */
export function scheduleWindowError(iso: string, now: number = Date.now()): string | null {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "Data sau ora nu sunt valide.";
  if (at < now + SCHEDULE_MIN_LEAD_MS) return "Alege o oră cu cel puțin 5 minute în viitor.";
  if (at > now + SCHEDULE_MAX_AHEAD_MS) return "Publicarea se poate programa cu cel mult 90 de zile înainte.";
  return null;
}

/** Stările în care o proprietate mai poate fi publicată la ora programată. */
export const SCHEDULE_PUBLISHABLE_STATUSES = new Set(["active", "reserved", "negotiation"]);

export type PortalScheduleView = {
  id: string;
  portalId: string;
  scheduledAt: string;
  status: "scheduled" | "executed" | "cancelled" | "failed";
  reason: string | null;
};
