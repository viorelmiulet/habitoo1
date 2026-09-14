/**
 * Matching client ↔ proprietate pentru CRM Agent (Stage 14).
 *
 * Scorul numeric vine EXCLUSIV din `scoreMatch` (`src/lib/matching.ts`), adică
 * din aceeași funcție folosită de pagina de potriviri: agentul AI nu are un
 * algoritm paralel. Aici doar adăugăm explicația structurată (criterii
 * îndeplinite / lipsă, diferență de preț și de suprafață), pe care modelul o
 * poate reformula în limbaj natural fără să schimbe cifrele.
 */
import { matchLabel, scoreMatch } from "@/lib/matching";
import type { Tables } from "@/integrations/supabase/types";

type RequestLike = Parameters<typeof scoreMatch>[0];
type PropertyLike = Parameters<typeof scoreMatch>[1];

export type CrmMatchExplanation = {
  propertyId: string;
  reference: string | null;
  title: string | null;
  score: number;
  label: string;
  met: string[];
  missing: string[];
  /** Diferența față de bugetul maxim: pozitiv = peste buget. */
  priceGap: number | null;
  /** Diferența față de suprafața minimă cerută: negativ = mai mică. */
  surfaceGap: number | null;
  city: string | null;
  rooms: number | null;
  price: number | null;
};

export type MatchRequestInput = RequestLike & { id: string; title: string };
export type MatchPropertyInput = PropertyLike & {
  id: string;
  reference: string | null;
  title: string | null;
};

function numberOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Potrivirile unei cereri, ordonate descrescător după scorul determinist. */
export function matchRequestToProperties(
  request: MatchRequestInput,
  properties: MatchPropertyInput[],
  options: { minScore?: number; limit?: number } = {},
): CrmMatchExplanation[] {
  const minScore = options.minScore ?? 55;
  const limit = options.limit ?? 8;

  return properties
    .map((property) => {
      const { score, reasons, misses } = scoreMatch(request, property);
      const price = numberOf(property.price);
      const budgetMax = numberOf(request.budget_max);
      const surface = numberOf(property.surface);
      const surfaceMin = numberOf(request.surface_min);
      return {
        propertyId: property.id,
        reference: property.reference,
        title: property.title,
        score,
        label: matchLabel(score),
        met: reasons,
        missing: misses,
        priceGap: price !== null && budgetMax !== null ? Math.round(price - budgetMax) : null,
        surfaceGap:
          surface !== null && surfaceMin !== null ? Math.round(surface - surfaceMin) : null,
        city: property.city ?? null,
        rooms: property.rooms ?? null,
        price,
      } satisfies CrmMatchExplanation;
    })
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

/** Adaptor din rândurile bazei de date către intrarea funcției de scor. */
export function requestForMatching(row: Tables<"requests">): MatchRequestInput {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    cities: row.cities,
    areas: row.areas,
    rooms_min: row.rooms_min,
    rooms_max: row.rooms_max,
    surface_min: row.surface_min,
    features: row.features,
    property_type: row.property_type,
  };
}
