/**
 * „Verificare AI” a comparabilelor ACP — reguli pure.
 *
 * AI-ul doar semnalează (OK / Suspect, cu motiv). Nu exclude nimic și nu
 * calculează prețuri: agentul decide, iar recalcularea pornește doar la
 * decizia lui. La AI pleacă doar caracteristicile proprietăților, fără date
 * personale, URL-uri, surse sau referințe interne.
 */
import { z } from "zod";
import { redactListingText } from "../enrichment";
import { detectResidentialComplex, residentialComplexByKey } from "../complexes";
import type { AcpSubject } from "../scoring";

export const ACP_AI_REVIEW_PROMPT_VERSION = "acp-review-1";
export const ACP_AI_REVIEW_CAPABILITY = "acp_ai_review";
export const ACP_AI_REVIEW_MAX_COMPARABLES = 40;

export type AcpReviewComparableInput = {
  key: string;
  title: string | null;
  locationLabel: string | null;
  subject: AcpSubject;
  adjustedPricePerSqm: number | null;
  distanceKm?: number | null;
};

const round = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

function complexLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return residentialComplexByKey(key)?.label ?? key.replace(/^ai:/, "").replace(/-/g, " ");
}

/** Titlu fără referința internă („HB-1170 · …”) și fără date personale. */
function cleanTitle(title: string | null): string {
  return redactListingText((title ?? "").replace(/^[A-Z]{1,4}-\d+\s*·\s*/, "")).slice(0, 160);
}

function describe(subject: AcpSubject, title?: string | null) {
  const area = subject.usableArea ?? null;
  // Ansamblul recunoscut (din date sau din titlu) dă zona reală, ca la motorul v4.
  const complex = residentialComplexByKey(subject.complex) ?? detectResidentialComplex(title);
  return {
    tip: subject.propertyType ?? null,
    camere: subject.rooms ?? null,
    suprafata_mp: area,
    pret_pe_mp_listat:
      round(subject.pricePerSqm) ?? (subject.price && area ? Math.round(subject.price / area) : null),
    zona: [subject.neighborhood ?? subject.district, subject.city, subject.county].filter(Boolean).join(", ") || null,
    ansamblu: complex?.label ?? complexLabel(subject.complex),
    zona_ansamblu: complex ? `${complex.city}, ${complex.county}` : null,
    moneda: subject.currency ?? "EUR",
    stare: subject.condition ?? null,
    an: subject.constructionYear ?? null,
  };
}

export function buildReviewPayload(
  target: AcpSubject,
  comparables: readonly AcpReviewComparableInput[],
  targetTitle?: string | null,
) {
  const list = comparables.slice(0, ACP_AI_REVIEW_MAX_COMPARABLES);
  return {
    refs: list.map((c, i) => ({ ref: `c${i + 1}`, key: c.key })),
    payload: {
      proprietate: describe(target, targetTitle),
      comparabile: list.map((c, i) => ({
        ref: `c${i + 1}`,
        titlu: cleanTitle(c.title),
        ...describe(c.subject, c.title),
        zona: c.locationLabel ?? describe(c.subject).zona,
        pret_pe_mp_ajustat: round(c.adjustedPricePerSqm),
        distanta_km: typeof c.distanceKm === "number" ? Math.round(c.distanceKm * 10) / 10 : null,
      })),
    },
  };
}

export const ACP_AI_REVIEW_SYSTEM_PROMPT = `Ești un evaluator imobiliar care verifică lista de comparabile a unei analize comparative de piață din România.
Nu calculezi și nu propui prețuri. Pentru fiecare comparabil spui doar dacă este potrivit („ok”) sau „suspect”, cu un motiv scurt (max. 120 caractere), în română, concret.
Când există „zona_ansamblu”, ea este zona reală a proprietății (de ex. Militari Residence este în Chiajna, Ilfov, deși unele anunțuri scriu „Militari, București”); comparabilele din același ansamblu sau din acea localitate sunt în aceeași zonă.
Marchează „suspect” doar pentru motive clare: altă zonă sau alt ansamblu decât proprietatea (folosește titlul, zona, ansamblul și distanța), alt tip de proprietate, număr de camere sau suprafață foarte diferite, preț/m² mult peste sau sub restul comparabilelor (ex. aproape dublu), stare foarte diferită.
Dacă datele lipsesc, nu presupune: lasă „ok”. Răspunde exclusiv cu JSON valid.`;

export const ACP_AI_REVIEW_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["comparabile"],
  properties: {
    comparabile: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "verdict", "motiv"],
        properties: {
          ref: { type: "string" },
          verdict: { type: "string", enum: ["ok", "suspect"] },
          motiv: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const Item = z.object({
  ref: z.string(),
  verdict: z.enum(["ok", "suspect"]),
  motiv: z.string().max(300).nullable(),
});

export type AcpReviewVerdict = { verdict: "ok" | "suspect"; reason: string | null };

export function buildReviewUserPrompt(payload: unknown): string {
  return `Verifică fiecare comparabil față de proprietate. Întoarce {"comparabile": [...]} cu câte un element pentru fiecare ref, conform schemei: ${JSON.stringify(ACP_AI_REVIEW_RESPONSE_SCHEMA)}\n\nDate:\n${JSON.stringify(payload)}`;
}

/** Validează răspunsul și îl leagă de cheile comparabilelor. Valid doar dacă acoperă toate ref-urile. */
export function parseReviewResponse(
  raw: string,
  refs: readonly { ref: string; key: string }[],
): { ok: boolean; items: Record<string, AcpReviewVerdict> } {
  const items: Record<string, AcpReviewVerdict> = {};
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, items };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, items };
  }
  const list = (parsed as { comparabile?: unknown })?.comparabile;
  if (!Array.isArray(list)) return { ok: false, items };
  const byRef = new Map(refs.map((r) => [r.ref, r.key]));
  for (const entry of list) {
    const r = Item.safeParse(entry);
    if (!r.success) continue;
    const key = byRef.get(r.data.ref);
    if (!key) continue;
    items[key] = {
      verdict: r.data.verdict,
      reason: r.data.verdict === "suspect" ? (r.data.motiv?.trim().slice(0, 160) || "Comparabil suspect") : null,
    };
  }
  return { ok: Object.keys(items).length === refs.length, items };
}

export type AcpAiReviewRecord = {
  reviewedAt: string;
  analysisVersion: number;
  provider: string;
  model: string;
  promptVersion: string;
  costUsd: number;
  items: Record<string, AcpReviewVerdict>;
};
