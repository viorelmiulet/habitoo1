import type { Tables } from "@/integrations/supabase/types";

export type MatchScore = {
  score: number;
  reasons: string[];
  misses: string[];
};

/**
 * Scor de potrivire între o cerere și o proprietate.
 * Factori: tranzacție, buget, oraș/zonă, camere, suprafață, facilități.
 */
export function scoreMatch(
  request: Pick<
    Tables<"requests">,
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
  >,
  property: Pick<
    Tables<"properties">,
    | "transaction_kind"
    | "price"
    | "city"
    | "district"
    | "address"
    | "rooms"
    | "surface"
    | "features"
    | "property_type"
    | "status"
  >,
): MatchScore {
  const reasons: string[] = [];
  const misses: string[] = [];
  let earned = 0;
  let total = 0;

  const wantedKind = request.kind === "rent" ? "rent" : "sale";
  total += 30;
  if (property.transaction_kind === wantedKind) {
    earned += 30;
    reasons.push("Tip tranzacție");
  } else {
    misses.push("Tip tranzacție diferit");
  }

  total += 25;
  const price = property.price ? Number(property.price) : null;
  const min = request.budget_min ? Number(request.budget_min) : null;
  const max = request.budget_max ? Number(request.budget_max) : null;
  if (price === null || (min === null && max === null)) {
    earned += 12;
  } else if ((min === null || price >= min) && (max === null || price <= max)) {
    earned += 25;
    reasons.push("Buget");
  } else if (max !== null && price <= max * 1.1) {
    earned += 15;
    reasons.push("Buget aproape de limită");
  } else {
    misses.push("Preț peste buget");
  }

  total += 20;
  const cities = (request.cities ?? []).map((c) => c.toLowerCase());
  const areas = (request.areas ?? []).map((a) => a.toLowerCase());
  const propCity = (property.city ?? "").toLowerCase();
  const propArea = `${property.district ?? ""} ${property.address ?? ""}`.toLowerCase();
  const cityOk = cities.length === 0 || cities.some((c) => propCity.includes(c));
  const areaOk = areas.length === 0 || areas.some((a) => propArea.includes(a));
  if (cityOk && areaOk) {
    earned += 20;
    reasons.push("Zonă");
  } else if (cityOk) {
    earned += 12;
    reasons.push("Oraș");
  } else {
    misses.push("Zonă diferită");
  }

  total += 15;
  const rooms = property.rooms ?? null;
  if (rooms === null || (request.rooms_min === null && request.rooms_max === null)) {
    earned += 7;
  } else if (
    (request.rooms_min === null || rooms >= request.rooms_min) &&
    (request.rooms_max === null || rooms <= request.rooms_max)
  ) {
    earned += 15;
    reasons.push("Număr camere");
  } else {
    misses.push("Număr camere");
  }

  total += 10;
  const surface = property.surface ? Number(property.surface) : null;
  const surfaceMin = request.surface_min ? Number(request.surface_min) : null;
  if (surface === null || surfaceMin === null) {
    earned += 5;
  } else if (surface >= surfaceMin) {
    earned += 10;
    reasons.push("Suprafață");
  } else {
    misses.push("Suprafață mai mică");
  }

  const wantedFeatures = request.features ?? [];
  if (wantedFeatures.length > 0) {
    total += 10;
    const have = (property.features ?? []).map((f) => f.toLowerCase());
    const hits = wantedFeatures.filter((f) => have.includes(f.toLowerCase())).length;
    earned += Math.round((hits / wantedFeatures.length) * 10);
    if (hits > 0) reasons.push(`${hits}/${wantedFeatures.length} facilități`);
  }

  const score = Math.max(0, Math.min(100, Math.round((earned / total) * 100)));
  return { score, reasons, misses };
}

export function matchTone(score: number): "success" | "info" | "warning" | "neutral" {
  if (score >= 90) return "success";
  if (score >= 75) return "info";
  if (score >= 60) return "warning";
  return "neutral";
}

export function matchLabel(score: number) {
  if (score >= 90) return "Match excelent";
  if (score >= 75) return "Match bun";
  if (score >= 60) return "Match posibil";
  return "Match slab";
}
