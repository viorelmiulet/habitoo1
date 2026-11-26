/**
 * „Agentul AI recomandă” — reguli deterministe, fără apel AI, pe datele deja
 * citite pentru Acasă. Maximum 3 recomandări, câte una pe tip.
 */
import { normalizeListingText } from "@/lib/ai/text-correction/text";

export type RecProperty = {
  id: string;
  title: string;
  ref?: string | null;
  /** Lipsurile calculate cu `missingEssentials` din `@/lib/property-essentials`. */
  missing: string[];
};
export type RecMatch = { propertyId: string; propertyTitle: string | null };

export type Recommendation =
  | { kind: "matches"; propertyId: string; count: number; title: string; text: string; action: "Vezi potrivirile" }
  | { kind: "incomplete"; propertyId: string; count: number; title: string; text: string; action: "Completează cu AI" }
  | { kind: "caps"; propertyId: string; title: string; text: string; action: "Corectează" };

/** Aceeași detecție ca la corectarea textului: titlul s-ar schimba doar prin majuscule. */
export function isAllCapsTitle(title: string): boolean {
  const t = title.trim();
  if (!/\p{L}/u.test(t)) return false;
  const normalized = normalizeListingText(t);
  return normalized !== t && normalized.toLocaleLowerCase("ro") === t.replace(/ {2,}/g, " ").toLocaleLowerCase("ro").replace(/[şţ]/g, (c) => (c === "ş" ? "ș" : "ț"));
}

const label = (p: { title: string; ref?: string | null }) => p.ref || p.title;

export function buildRecommendations(input: { properties: RecProperty[]; matches: RecMatch[] }): Recommendation[] {
  const out: Recommendation[] = [];
  const byProp = new Map<string, { count: number; title: string | null }>();
  for (const m of input.matches) {
    const e = byProp.get(m.propertyId) ?? { count: 0, title: m.propertyTitle };
    e.count += 1;
    byProp.set(m.propertyId, e);
  }
  const top = [...byProp.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (top) {
    const [propertyId, { count, title }] = top;
    const prop = input.properties.find((p) => p.id === propertyId);
    out.push({
      kind: "matches", propertyId, count, action: "Vezi potrivirile",
      title: `${count} ${count === 1 ? "cerere nouă se potrivește" : "cereri noi se potrivesc"} cu ${prop ? label(prop) : (title ?? "o proprietate")}`,
      text: "Buget, zonă și număr de camere potrivite pentru această proprietate.",
    });
  }
  const incomplete = input.properties.map((p) => ({ p, missing: p.missing })).filter((x) => x.missing.length);
  if (incomplete.length) {
    const first = incomplete[0]!;
    const n = incomplete.length;
    out.push({
      kind: "incomplete", propertyId: first.p.id, count: n, action: "Completează cu AI",
      title: n === 1 ? "1 anunț are fișa incompletă" : `${n} anunțuri au fișa incompletă`,
      text: `Lipsesc ${first.missing.join(", ")}. AI-ul le poate completa din descriere și poze.`,
    });
  }
  const caps = input.properties.find((p) => isAllCapsTitle(p.title));
  if (caps) {
    out.push({
      kind: "caps", propertyId: caps.id, action: "Corectează",
      title: `Titlu scris doar cu majuscule la ${label(caps)}`,
      text: "Corectarea textului îl face mai ușor de citit pe portaluri.",
    });
  }
  return out.slice(0, 3);
}
