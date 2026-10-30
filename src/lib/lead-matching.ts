import type { Tables } from "@/integrations/supabase/types";
import { scoreMatch, type MatchScore } from "@/lib/matching";

type Property = Tables<"properties">;
type Request = Tables<"requests">;

export type LeadCriteria = Pick<
  Request,
  | "kind"
  | "budget_min"
  | "budget_max"
  | "cities"
  | "areas"
  | "rooms_min"
  | "rooms_max"
  | "surface_min"
  | "features"
  | "property_type"
>;

export const LEAD_MATCH_MIN_SCORE = 60;
export const LEAD_MATCH_STATUSES = ["active", "reserved", "negotiation"] as const;

/** Criteriile derivate din proprietatea de pe care a intrat lead-ul. */
export function criteriaFromProperty(p: Property): LeadCriteria {
  const price = p.price != null ? Number(p.price) : null;
  const surface = p.surface != null ? Number(p.surface) : null;
  return {
    kind: p.transaction_kind === "rent" ? "rent" : "buy",
    budget_min: price != null ? Math.round(price * 0.85) : null,
    budget_max: price != null ? Math.round(price * 1.15) : null,
    cities: p.city ? [p.city] : [],
    areas: p.district ? [p.district] : [],
    rooms_min: p.rooms ?? null,
    rooms_max: p.rooms ?? null,
    surface_min: surface != null ? Math.round(surface * 0.85 * 100) / 100 : null,
    features: [],
    property_type: p.property_type,
  } as LeadCriteria;
}

const typeGroup = (t: string | null | undefined) =>
  t === "studio" || t === "apartment" ? "apartment" : (t ?? "");

/** Camere identice și preț în buget (+10% toleranță peste maxim); criteriile lipsă nu se aplică. */
function withinLeadHardLimits(c: LeadCriteria, p: Property) {
  if (c.rooms_min != null && p.rooms !== c.rooms_min) return false;
  if (c.budget_min != null && c.budget_max != null) {
    const price = p.price != null ? Number(p.price) : null;
    if (price === null) return false;
    if (price < Number(c.budget_min) || price > Number(c.budget_max) * 1.1) return false;
  }
  return true;
}

export type LeadMatch = { property: Property; match: MatchScore };

/** Potrivirile unui lead: aceeași agenție, status activ, aceeași tranzacție și tip, scor ≥ 60. */
export function computeLeadMatches(source: Property, candidates: Property[]): LeadMatch[] {
  const criteria = criteriaFromProperty(source);
  return candidates
    .filter(
      (p) =>
        p.id !== source.id &&
        p.organization_id === source.organization_id &&
        (LEAD_MATCH_STATUSES as readonly string[]).includes(p.status) &&
        p.transaction_kind === source.transaction_kind &&
        typeGroup(p.property_type) === typeGroup(source.property_type) &&
        withinLeadHardLimits(criteria, p),
    )
    .map((property) => ({ property, match: scoreMatch(criteria, property) }))
    .filter((r) => r.match.score >= LEAD_MATCH_MIN_SCORE)
    .sort((a, b) => b.match.score - a.match.score);
}

type Lead = Tables<"leads">;

export type LeadMatchRow = { key: string; lead: Lead; source: Property; property: Property; match: MatchScore };

/** Cheia persoanei: telefon (doar cifre, ultimele 9) sau email; altfel id-ul lead-ului. */
export function leadPersonKey(lead: Pick<Lead, "id" | "phone" | "email">): string {
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 6) return `p:${digits.slice(-9)}`;
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  return `id:${lead.id}`;
}

/** Lead-uri active: cu proprietate, neșterse, etapa diferită de won/lost. */
export function isActiveLead(l: Pick<Lead, "property_id" | "deleted_at" | "stage">) {
  return Boolean(l.property_id) && !l.deleted_at && l.stage !== "won" && l.stage !== "lost";
}

/**
 * Potrivirile tuturor lead-urilor active cu proprietățile candidate,
 * deduplicate pe persoană și proprietate (rămâne scorul cel mai mare).
 */
export function buildLeadMatchRows(
  leads: Lead[],
  sourceById: Map<string, Property>,
  candidates: Property[],
): LeadMatchRow[] {
  const best = new Map<string, LeadMatchRow>();
  for (const lead of leads) {
    if (!isActiveLead(lead)) continue;
    const source = sourceById.get(lead.property_id as string);
    if (!source) continue;
    for (const { property, match } of computeLeadMatches(source, candidates)) {
      const k = `${leadPersonKey(lead)}|${property.id}`;
      const prev = best.get(k);
      if (!prev || match.score > prev.match.score) {
        best.set(k, { key: `lead:${lead.id}:${property.id}`, lead, source, property, match });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.match.score - a.match.score);
}

export type LeadRowFilters = {
  minScore: number;
  agent: string;
  city: string;
  type: string;
  onlyMineUserId: string | null;
  search: string;
  ignored?: Set<string>;
};

export function filterLeadRows(rows: LeadMatchRow[], f: LeadRowFilters): LeadMatchRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      r.match.score >= f.minScore &&
      !f.ignored?.has(r.key) &&
      (f.agent === "all" || r.property.assigned_to === f.agent || r.lead.assigned_to === f.agent) &&
      (f.city === "all" || r.property.city === f.city) &&
      (f.type === "all" || r.property.property_type === f.type) &&
      (!f.onlyMineUserId ||
        r.lead.assigned_to === f.onlyMineUserId ||
        r.property.assigned_to === f.onlyMineUserId) &&
      (!q || r.lead.name.toLowerCase().includes(q) || r.property.title.toLowerCase().includes(q)),
  );
}

/** Lead-uri compatibile cu o proprietate (≥60%), fără cele intrate chiar pe ea. */
export function countLeadMatchesForProperty(property: Property, leads: Lead[], sourceById: Map<string, Property>) {
  return buildLeadMatchRows(leads.filter((l) => l.property_id !== property.id), sourceById, [property]).length;
}
