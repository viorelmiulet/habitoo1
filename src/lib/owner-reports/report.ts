/**
 * Raportul săptămânal pentru proprietar (browser-safe, determinist).
 * Doar date existente; rândurile fără date se omit. Textul AI e validat
 * contra cifrelor din raport și a numelor clienților.
 */
export type ReportViews = { total: number; bySource: { label: string; views: number }[] };
export type ReportAcp = { min: number; max: number; asking: number; currency: string; position: "below" | "within" | "above"; diffPercent: number };
export type Recommendation = "price_adjust" | "keep";

export type OwnerReportData = {
  week: { start: string; end: string };
  property: { title: string; reference: string | null; price: number | null; currency: string; city: string | null };
  views: ReportViews | null;
  portals: string[];
  leads: { total: number; bySource: { source: string; count: number }[] };
  messages: number;
  viewings: { planned: number; done: number; feedback: number };
  acp: ReportAcp | null;
  recommendation: Recommendation;
  agent: { name: string; phone: string | null; email: string | null };
  agency: { name: string; accent: string | null };
};

export type OwnerReportNarrative = { intro: string; conclusion: string; recommendation: string };

export type RawReportInput = {
  week: { start: string; end: string };
  property: OwnerReportData["property"];
  siteVisits: { source: string | null; views: number }[];
  portalStats: { portal: string; views: number }[];
  publishedPortals: string[];
  leads: { source: string | null }[];
  inboundMessages: number;
  viewings: { status: string; description: string | null }[];
  acp: { estimated_min: number | null; estimated_max: number | null } | null;
  agent: OwnerReportData["agent"];
  agency: OwnerReportData["agency"];
  portalLabel?: (id: string) => string;
};

const SOURCE_LABELS: Record<string, string> = { website: "Site", site: "Site agenție", manual: "Introdus manual", phone: "Telefon", facebook: "Facebook" };

export function sourceLabel(source: string | null, portalLabel?: (id: string) => string): string {
  if (!source) return "Altă sursă";
  return SOURCE_LABELS[source] ?? portalLabel?.(source) ?? source;
}

function groupCount<T>(items: T[], key: (t: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/** Agregă datele brute; nu păstrează nume, telefoane sau emailuri ale clienților. */
export function buildReportData(raw: RawReportInput): OwnerReportData {
  const label = (s: string | null) => sourceLabel(s, raw.portalLabel);
  const viewMap = new Map<string, number>();
  for (const v of raw.siteVisits) if (v.views > 0) viewMap.set(label(v.source ?? "site"), (viewMap.get(label(v.source ?? "site")) ?? 0) + v.views);
  for (const v of raw.portalStats) if (v.views > 0) viewMap.set(label(v.portal), (viewMap.get(label(v.portal)) ?? 0) + v.views);
  const bySource = [...viewMap.entries()].map(([l, views]) => ({ label: l, views })).sort((a, b) => b.views - a.views);
  const views = bySource.length ? { total: bySource.reduce((s, v) => s + v.views, 0), bySource } : null;

  const asking = raw.property.price;
  let acp: ReportAcp | null = null;
  if (raw.acp?.estimated_min != null && raw.acp.estimated_max != null && asking) {
    const min = Number(raw.acp.estimated_min), max = Number(raw.acp.estimated_max);
    const position = asking > max ? "above" : asking < min ? "below" : "within";
    const ref = position === "above" ? max : position === "below" ? min : asking;
    acp = { min, max, asking, currency: raw.property.currency, position, diffPercent: Math.round((Math.abs(asking - ref) / ref) * 100) };
  }
  const viewings = {
    planned: raw.viewings.filter((v) => v.status === "planned").length,
    done: raw.viewings.filter((v) => v.status === "done").length,
    feedback: raw.viewings.filter((v) => (v.description ?? "").trim().length > 0).length,
  };
  return {
    week: raw.week,
    property: raw.property,
    views,
    portals: [...new Set(raw.publishedPortals.map((p) => raw.portalLabel?.(p) ?? p))].sort(),
    leads: { total: raw.leads.length, bySource: groupCount(raw.leads, (l) => label(l.source)).map((g) => ({ source: g.key, count: g.count })) },
    messages: raw.inboundMessages,
    viewings,
    acp,
    // Recomandarea de preț doar când ultima ACP arată un preț cerut peste interval.
    recommendation: acp?.position === "above" ? "price_adjust" : "keep",
    agent: raw.agent,
    agency: raw.agency,
  };
}

export const formatNumberRo = (n: number) => new Intl.NumberFormat("ro-RO").format(n);
export const formatDateRo = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const plural = (n: number, one: string, many: string) => `${formatNumberRo(n)} ${n === 1 ? one : many}`;

/** Rândurile cu cifre ale raportului (folosite în PDF, text și validare). */
export function reportLines(d: OwnerReportData): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  if (d.views) lines.push({ label: "Vizualizări", value: `${formatNumberRo(d.views.total)} (${d.views.bySource.map((v) => `${v.label}: ${formatNumberRo(v.views)}`).join(", ")})` });
  if (d.portals.length) lines.push({ label: "Publicat pe", value: d.portals.join(", ") });
  lines.push({ label: "Solicitări noi", value: d.leads.total ? `${formatNumberRo(d.leads.total)} (${d.leads.bySource.map((s) => `${s.source}: ${s.count}`).join(", ")})` : "0" });
  lines.push({ label: "Mesaje primite", value: formatNumberRo(d.messages) });
  lines.push({ label: "Vizionări", value: `${formatNumberRo(d.viewings.done)} efectuate, ${formatNumberRo(d.viewings.planned)} programate` });
  if (d.viewings.feedback) lines.push({ label: "Feedback notat", value: plural(d.viewings.feedback, "vizionare", "vizionări") });
  if (d.acp) {
    const pos = d.acp.position === "within" ? "în intervalul estimat" : d.acp.position === "above" ? `cu ${d.acp.diffPercent}% peste intervalul estimat` : `cu ${d.acp.diffPercent}% sub intervalul estimat`;
    lines.push({ label: "Poziționare față de piață", value: `interval estimat ${formatNumberRo(d.acp.min)}–${formatNumberRo(d.acp.max)} ${d.acp.currency}; prețul cerut ${formatNumberRo(d.acp.asking)} ${d.acp.currency} este ${pos}` });
  }
  return lines;
}

export function templateNarrative(d: OwnerReportData): OwnerReportNarrative {
  const activity = d.leads.total + d.viewings.done + d.viewings.planned;
  return {
    intro: `Vă trimitem raportul pentru ${d.property.title}, pentru săptămâna ${formatDateRo(d.week.start)} – ${formatDateRo(d.week.end)}.`,
    conclusion: activity > 0
      ? `Săptămâna aceasta au existat ${plural(d.leads.total, "solicitare nouă", "solicitări noi")} și ${plural(d.viewings.done + d.viewings.planned, "vizionare", "vizionări")}.`
      : "Săptămâna aceasta nu au existat solicitări sau vizionări noi.",
    recommendation: d.recommendation === "price_adjust"
      ? "Pe baza analizei de piață, recomandăm să discutăm o ajustare a prețului."
      : "Continuăm promovarea în forma actuală și revenim cu noutăți.",
  };
}

/** Numerele dintr-un text (78.000, 3,5, 12%, 2026-11-09). */
export function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:[.\s]\d{3})*(?:,\d+)?/g) ?? []).map((m) => Number(m.replace(/[.\s]/g, "").replace(",", ".")));
}

function allowedNumbers(d: OwnerReportData): Set<number> {
  const out = new Set<number>([0, 1]);
  const add = (t: string) => numbersIn(t).forEach((n) => out.add(n));
  for (const l of reportLines(d)) add(`${l.label} ${l.value}`);
  add(`${formatDateRo(d.week.start)} ${formatDateRo(d.week.end)} ${d.week.start} ${d.week.end}`);
  add(`${d.property.title} ${d.property.reference ?? ""} ${d.property.price ?? ""}`);
  [d.leads.total, d.messages, d.viewings.done, d.viewings.planned, d.viewings.done + d.viewings.planned, d.viewings.feedback, d.views?.total ?? 0].forEach((n) => out.add(n));
  return out;
}

const PRICE_ADVICE = /ajust|reduce|scăde|scade|micșor|micsor|reducer/i;

/** Acceptă textul AI doar fără cifre inventate, fără nume de clienți și fără sfat de preț nesusținut. */
export function validateNarrative(n: OwnerReportNarrative, d: OwnerReportData, forbiddenNames: string[]): boolean {
  const all = `${n.intro}\n${n.conclusion}\n${n.recommendation}`;
  if (!n.intro.trim() || !n.conclusion.trim() || !n.recommendation.trim() || all.length > 2500) return false;
  const allowed = allowedNumbers(d);
  for (const x of numbersIn(all)) if (![...allowed].some((a) => Math.abs(a - x) < 0.01)) return false;
  const lower = all.toLocaleLowerCase("ro-RO");
  for (const name of forbiddenNames) {
    for (const token of name.toLocaleLowerCase("ro-RO").split(/\s+/)) {
      if (token.length >= 3 && new RegExp(`(^|[^\\p{L}])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(lower)) return false;
    }
  }
  if (d.recommendation !== "price_adjust" && PRICE_ADVICE.test(n.recommendation)) return false;
  return true;
}

/** Versiunea scurtă pentru WhatsApp/email. */
export function shortReportText(d: OwnerReportData, pdfUrl: string | null): string {
  const t = templateNarrative(d);
  return [
    `Raport săptămânal ${formatDateRo(d.week.start)} – ${formatDateRo(d.week.end)}: ${d.property.title}`,
    ...reportLines(d).map((l) => `• ${l.label}: ${l.value}`),
    t.recommendation,
    pdfUrl ? `Raportul complet (PDF): ${pdfUrl}` : null,
    d.agent.name,
  ].filter(Boolean).join("\n");
}

/** „Trimite automat” cere email și consimțământ GDPR activ al proprietarului. */
export function canAutoSend(owner: { email: string | null; gdpr_consent: boolean; gdpr_withdrawn_at: string | null } | null): boolean {
  return !!owner && /.+@.+\..+/.test((owner.email ?? "").trim()) && owner.gdpr_consent && !owner.gdpr_withdrawn_at;
}

// ---- Calendar (ora României) ----
function romaniaParts(at: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")), weekday: g("weekday") };
}
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function romaniaClock(at: Date) { return romaniaParts(at); }

/** Săptămâna anterioară (luni–duminică), după data din România. */
export function previousWeek(at: Date): { start: string; end: string } {
  const { date } = romaniaParts(at);
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = luni
  const thisMonday = addDays(date, -dow);
  return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
}

/** Miezul nopții (ora României) al unei date, ca ISO UTC. */
export function romaniaMidnightUtc(isoDate: string): string {
  for (const offset of [3, 2]) {
    const c = new Date(`${isoDate}T00:00:00Z`);
    c.setUTCHours(c.getUTCHours() - offset);
    if (romaniaParts(c).date === isoDate && romaniaParts(c).hour === 0) return c.toISOString();
  }
  return new Date(`${isoDate}T00:00:00Z`).toISOString();
}

export const nextDay = (iso: string) => addDays(iso, 1);
