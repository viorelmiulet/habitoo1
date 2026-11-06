/** Calcule pure pentru cardurile de cifre de pe Acasă. */

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Adăugări pe zi pentru ultimele `days` zile (ultima valoare = azi). */
export function dailyAdditions(createdAt: string[], now: Date, days = 14): number[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const iso of createdAt) {
    const k = dayKey(new Date(iso));
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map((k) => counts.get(k) ?? 0);
}

/** Adăugări în ultimele 30 de zile față de cele 30 de dinainte. */
export function monthComparison(createdAt: string[], now: Date) {
  const t = now.getTime();
  const month = 30 * 86_400_000;
  let current = 0;
  let previous = 0;
  for (const iso of createdAt) {
    const age = t - new Date(iso).getTime();
    if (age < 0) continue;
    if (age < month) current++;
    else if (age < 2 * month) previous++;
  }
  return { current, previous };
}

export type Trend = { text: string; tone: "up" | "down" | "same" };

export function trendLabel(current: number, previous: number): Trend {
  if (current === previous) return { text: "La fel ca luna trecută", tone: "same" };
  if (previous === 0) return { text: "Nou față de luna trecută", tone: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "La fel ca luna trecută", tone: "same" };
  return pct > 0
    ? { text: `+${pct}% față de luna trecută`, tone: "up" }
    : { text: `${pct}% față de luna trecută`, tone: "down" };
}

/** Timp relativ scurt: „acum 5 minute”, „acum 2 ore”, „ieri”, „acum 3 zile”. */
export function relativeTime(value: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 60_000));
  if (min < 1) return "chiar acum";
  if (min < 60) return min === 1 ? "acum un minut" : `acum ${min} ${min % 100 >= 20 || min % 100 === 0 ? "de " : ""}minute`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? "acum o oră" : `acum ${h} ${h >= 20 ? "de " : ""}ore`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ieri";
  return `acum ${d} ${d % 100 >= 20 || d % 100 === 0 ? "de " : ""}zile`;
}

/** Sursa lead-ului pentru afișare: lipsă sau „site” → „Site”. */
export function leadSourceLabel(source: string | null | undefined): string {
  const s = (source ?? "").trim();
  return !s || s.toLowerCase() === "site" ? "Site" : s;
}
