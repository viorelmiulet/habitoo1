import { fold, type DraftProperty, type ExtractedRequest } from "./schema";

export type LeadInteraction = { direction: string; body: string | null; sent_at?: string | null };
export type LeadQualification = { score: number; reason: string };
/** Explainable signals, not an AI prediction of a transaction. Missing facts earn no points. */
export function qualifyLead(message: string, request: ExtractedRequest, property: DraftProperty | null, interactions: LeadInteraction[]): LeadQualification {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(`${reason} (+${points})`); };
  const text = fold(message);
  if (/vizion|vizit|pot.*vedea|cand.*vedea/.test(text)) add(25, "Solicită vizionare în mesaj");
  else if (/caut|cumpar|inchiri|buget|pret|disponibil/.test(text)) add(15, "Interes explicit în mesaj");
  if (request.budget_min !== null || request.budget_max !== null) add(15, "Buget declarat în conversație");
  if (property) {
    if (request.currency === property.currency && property.price !== null
      && (request.budget_min === null || property.price >= request.budget_min)
      && (request.budget_max === null || property.price <= request.budget_max)
      && (request.budget_min !== null || request.budget_max !== null)) add(20, "Prețul anunțului se încadrează în bugetul declarat, în aceeași monedă");
    if (request.rooms_min !== null && property.rooms !== null && property.rooms >= request.rooms_min && (request.rooms_max === null || property.rooms <= request.rooms_max)) add(10, "Camerele corespund cererii");
    if (request.property_type !== null && property.property_type === request.property_type) add(5, "Tipul proprietății corespunde");
    if (property.city && request.cities.some(c => fold(c) === fold(property.city ?? ""))) add(5, "Localitatea corespunde");
  }
  const incoming = interactions.filter(m => m.direction === "in" && m.body?.trim());
  if (incoming.length >= 2) add(Math.min(10, (incoming.length - 1) * 5), `${incoming.length} mesaje ale clientului`);
  const ordered = [...interactions].filter(m => m.sent_at && Number.isFinite(Date.parse(m.sent_at))).sort((a, b) => Date.parse(a.sent_at ?? "") - Date.parse(b.sent_at ?? ""));
  const delays: number[] = [];
  let lastOut: number | null = null;
  for (const item of ordered) {
    const at = Date.parse(item.sent_at ?? "");
    if (item.direction === "out") lastOut = at;
    else if (item.direction === "in" && lastOut !== null && at >= lastOut) { delays.push(at - lastOut); lastOut = null; }
  }
  if (delays.length) {
    const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
    if (avg <= 3600000) add(10, "Clientul răspunde în medie în maximum o oră");
    else if (avg <= 86400000) add(5, "Clientul răspunde în medie în maximum 24 de ore");
  }
  return { score: Math.min(100, score), reason: reasons.join(" · ") || "Nu există încă semnale verificabile de interes, buget sau răspuns." };
}