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
        typeGroup(p.property_type) === typeGroup(source.property_type),
    )
    .map((property) => ({ property, match: scoreMatch(criteria, property) }))
    .filter((r) => r.match.score >= LEAD_MATCH_MIN_SCORE)
    .sort((a, b) => b.match.score - a.match.score);
}
