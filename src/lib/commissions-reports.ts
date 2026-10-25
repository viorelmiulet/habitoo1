// Comisioane — rapoarte: perioade, indicatori, comparații și serii lunare.
// Logică pură, testabilă; totalurile sunt în EUR (RON convertit cu cursul
// BNR păstrat pe comision, din ziua tranzacției).

export type ReportPreset = "week" | "month" | "year" | "custom";

export type ReportRange = { from: string; to: string };

export type CommissionReportRow = {
  agent_id: string;
  transaction_date: string;
  transaction_kind: string;
  property_type: string;
  agency_commission: number;
  agent_amount: number;
  currency: string;
  status: string;
  ron_to_eur_rate?: number | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Intervalul pentru preset; „custom” folosește datele primite. */
export function reportRange(
  preset: ReportPreset,
  today: Date,
  custom?: { from: string; to: string },
): ReportRange {
  if (preset === "custom" && custom?.from && custom?.to) {
    return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
  }
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (preset === "week") {
    const dow = (t.getUTCDay() + 6) % 7; // luni = 0
    const from = addDays(t, -dow);
    return { from: iso(from), to: iso(addDays(from, 6)) };
  }
  if (preset === "month") {
    const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const to = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
    return { from: iso(from), to: iso(to) };
  }
  const from = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const to = new Date(Date.UTC(t.getUTCFullYear(), 11, 31));
  return { from: iso(from), to: iso(to) };
}

/** Perioada anterioară de aceeași lungime, imediat înainte. */
export function previousRange(range: ReportRange): ReportRange {
  const days = Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / 86_400_000) + 1;
  const to = addDays(parse(range.from), -1);
  return { from: iso(addDays(to, -(days - 1))), to: iso(to) };
}

/** Aceeași perioadă, anul trecut. */
export function lastYearRange(range: ReportRange): ReportRange {
  const shift = (s: string) => {
    const d = parse(s);
    return iso(new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate())));
  };
  return { from: shift(range.from), to: shift(range.to) };
}

/** Valoarea în EUR: RON se împarte la cursul BNR păstrat pe comision. */
export function toEur(amount: number, currency: string, ronToEurRate?: number | null): number {
  return convertCommissionAmount(amount, currency, "EUR", ronToEurRate);
}

export type DisplayCurrency = "EUR" | "RON";
export function convertCommissionAmount(amount: number, source: string, target: DisplayCurrency, savedRate?: number | null): number {
  const n = Number(amount) || 0;
  if (source === target) return n;
  const rate = Number(savedRate);
  return Number.isFinite(rate) && rate > 0 ? (target === "EUR" ? n / rate : n * rate) : 0;
}

export const inRange = (date: string, range: ReportRange) => date >= range.from && date <= range.to;

export type ReportKpis = {
  agencyEur: number;
  agentEur: number;
  count: number;
  avgEur: number;
  collectedEur: number;
  pendingEur: number;
};

/** Indicatori pe o mulțime de comisioane; cele anulate nu intră în totaluri. */
export function reportKpis(rows: CommissionReportRow[], currency: DisplayCurrency = "EUR"): ReportKpis {
  let agencyEur = 0;
  let agentEur = 0;
  let collectedEur = 0;
  let pendingEur = 0;
  let count = 0;
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const agency = convertCommissionAmount(r.agency_commission, r.currency, currency, r.ron_to_eur_rate);
    agencyEur += agency;
    agentEur += convertCommissionAmount(r.agent_amount, r.currency, currency, r.ron_to_eur_rate);
    if (r.status === "collected") collectedEur += agency;
    else pendingEur += agency;
    count += 1;
  }
  return { agencyEur, agentEur, count, avgEur: count ? agencyEur / count : 0, collectedEur, pendingEur };
}

export type KpiComparison = { diff: number; pct: number | null };

/** Diferența în valoare și procente față de o perioadă de referință. */
export function compareValue(current: number, reference: number): KpiComparison {
  const diff = current - reference;
  return { diff, pct: reference !== 0 ? (diff / reference) * 100 : null };
}

export type MonthlyPoint = { month: string; current: number; lastYear: number };

/** Evoluția pe luni a comisionului agenției (EUR): perioada aleasă vs. anul trecut. */
export function monthlySeries(rows: CommissionReportRow[], range: ReportRange, currency: DisplayCurrency = "EUR"): MonthlyPoint[] {
  const last = lastYearRange(range);
  const months: string[] = [];
  const cursor = new Date(Date.UTC(parse(range.from).getUTCFullYear(), parse(range.from).getUTCMonth(), 1));
  const end = parse(range.to);
  while (cursor <= end) {
    months.push(iso(cursor).slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months.map((m) => {
    let current = 0;
    let lastYear = 0;
    for (const r of rows) {
      if (r.status === "cancelled") continue;
      const v = convertCommissionAmount(r.agency_commission, r.currency, currency, r.ron_to_eur_rate);
      if (r.transaction_date.slice(0, 7) === m && inRange(r.transaction_date, range)) current += v;
      const shifted = shiftYear(r.transaction_date, 1);
      if (shifted.slice(0, 7) === m && inRange(r.transaction_date, last)) lastYear += v;
    }
    return { month: m, current: Math.round(current * 100) / 100, lastYear: Math.round(lastYear * 100) / 100 };
  });
}

const shiftYear = (date: string, years: number) => {
  const d = parse(date);
  return iso(new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate())));
};

export type BreakdownSlice = { key: string; value: number; count: number };

/** Împărțirea comisionului agenției (EUR) pe o cheie (tip tranzacție, tip proprietate, agent). */
export function breakdownBy(rows: CommissionReportRow[], key: "transaction_kind" | "property_type" | "agent_id", currency: DisplayCurrency = "EUR"): BreakdownSlice[] {
  const map = new Map<string, BreakdownSlice>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const k = r[key] || "—";
    const slice = map.get(k) ?? { key: k, value: 0, count: 0 };
    slice.value += convertCommissionAmount(r.agency_commission, r.currency, currency, r.ron_to_eur_rate);
    slice.count += 1;
    map.set(k, slice);
  }
  return [...map.values()]
    .map((s) => ({ ...s, value: Math.round(s.value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}
