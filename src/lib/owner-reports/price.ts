import { normalizePropertyType } from '@/lib/market/normalize';

export type PriceSubject = { id: string; type: string | null; transaction: string | null; city: string | null; area: number | null; rooms: number | null; currency: string };
export type PriceComparable = PriceSubject & { title: string; price: number; source: string; url: string | null };
export type PriceEstimate = { status: 'insufficient'; comparables: []; criteria: string[] } | { status: 'ready'; min: number; max: number; median: number; currency: string; comparables: PriceComparable[]; criteria: string[] };
const key = (s: string | null) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const transaction = (s: string | null) => /rent|inchiri|chirie/.test(key(s)) ? 'rent' : /sale|vanz|vânz/.test(key(s)) ? 'sale' : key(s);

/** Asking prices only. Never infer missing currency, geography or surface. */
export function estimatePrice(subject: PriceSubject, rows: PriceComparable[]): PriceEstimate {
  const criteria = ['Același tip de proprietate, tranzacție, oraș și monedă', 'Suprafață între 75% și 125% din suprafața anunțului', 'Diferență de cel mult o cameră, când camerele sunt cunoscute', 'Interval: quartilele prețurilor cerute; nu sunt tranzacții confirmate'];
  const seen = new Set<string>();
  const comparables = rows.filter(c => {
    const identity = c.url || c.id;
    if (c.id === subject.id || seen.has(c.id) || seen.has(identity) || c.source.toLowerCase().includes('facebook')) return false;
    if (!subject.type || !subject.transaction || !subject.city || !subject.area || !c.area || !Number.isFinite(c.price) || c.price <= 0) return false;
    if (!normalizePropertyType(subject.type) || normalizePropertyType(c.type) !== normalizePropertyType(subject.type) || transaction(c.transaction) !== transaction(subject.transaction) || key(c.city) !== key(subject.city) || c.currency !== subject.currency) return false;
    if (c.area < subject.area * .75 || c.area > subject.area * 1.25 || (c.rooms !== null && subject.rooms !== null && Math.abs(c.rooms - subject.rooms) > 1)) return false;
    seen.add(c.id); seen.add(identity); return true;
  });
  if (comparables.length < 5) return { status: 'insufficient', comparables: [], criteria };
  const prices = comparables.map(c => c.price).sort((a,b) => a-b);
  const q = (p: number) => { const at = (prices.length-1)*p; const lo=prices[Math.floor(at)] ?? 0; const hi=prices[Math.ceil(at)] ?? lo; return lo+(hi-lo)*(at-Math.floor(at)); };
  return { status: 'ready', min: q(.25), max: q(.75), median: q(.5), currency: subject.currency, comparables, criteria };
}

export function priceAlert(estimate: PriceEstimate, price: number | null, publishedAt: string | null, leadDates: string[], now: Date): boolean {
  const from = now.getTime()-30*86400000;
  return estimate.status === 'ready' && price !== null && price-estimate.median > estimate.median*.10 && !!publishedAt && Number.isFinite(Date.parse(publishedAt)) && Date.parse(publishedAt) <= from && !leadDates.some(date => !Number.isFinite(Date.parse(date)) || Date.parse(date) >= from);
}