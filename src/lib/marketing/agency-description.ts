import { z } from "zod";

const counted = z.object({ value: z.string(), count: z.number().int().nonnegative() });
export const agencyDescriptionStatsSchema = z.object({
  total: z.number().int().nonnegative(), sale: z.number().int().nonnegative(), rent: z.number().int().nonnegative(),
  types: z.array(counted), places: z.array(counted),
  prices: z.array(z.object({ transaction: z.string(), currency: z.string(), min: z.number().positive(), max: z.number().positive(), count: z.number().int().positive() })),
  developments: z.array(z.string()),
});
export type AgencyDescriptionStats = z.infer<typeof agencyDescriptionStatsSchema>;
type Agency = { name: string; slug: string; city: string | null; description: string | null; phone: string | null; email: string | null; website: string | null };

/** Stable slug-based choices; no date/randomness, so wording never rotates on refresh. */
export function agencyDescriptionVariant(slug: string, sentence = 0): number {
  let hash = 0;
  for (const c of slug.toLowerCase()) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return (hash + sentence) % 4;
}
const choose = (slug: string, sentence: number, alternatives: readonly string[]) => alternatives[agencyDescriptionVariant(slug, sentence)] ?? alternatives[0] ?? "";
const join = (items: string[]) => items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} și ${items.at(-1)}`;
const amount = (n: number) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(n);
const offerCount = (n: number) => n === 1 ? "o ofertă" : `${amount(n)}${n % 100 === 0 || n % 100 >= 20 ? " de" : ""} oferte`;
const TYPE_NAMES: Record<string, string> = {
  apartment: "apartamente", studio: "garsoniere", house: "case", villa: "vile", land: "terenuri",
  commercial: "spații comerciale", office: "birouri", industrial: "spații industriale",
  penthouse: "penthouse-uri", duplex: "duplexuri", hotel: "hoteluri", garage: "garaje",
};

/** Meta starts with the factual opening; additions refer only to the visible offer list. */
export function agencyDescriptionMeta(firstSentence: string): string {
  let text = firstSentence.trim();
  if (text.length < 140) text = `${text.replace(/[.!?]$/, "")}; vezi mai jos ofertele publicate ale agenției și detaliile fiecărei proprietăți disponibile în această listă.`;
  if (text.length <= 160) return text;
  const cut = text.slice(0, 159);
  const boundary = cut.lastIndexOf(" ");
  return `${boundary >= 139 ? cut.slice(0, boundary) : cut}…`;
}

/** Only this allowlisted aggregate and public agency identity can enter the text. */
export function buildAgencyDescription(a: Agency, stats: AgencyDescriptionStats) {
  if (stats.total < 1) return { description: null, automaticDescription: null, metaDescription: null };
  const location = a.city ? ` din ${a.city}` : "";
  const breakdown = `${amount(stats.sale)} la vânzare și ${amount(stats.rent)} la închiriere`;
  const first = choose(a.slug, 0, [
    `${a.name}${location} are acum ${offerCount(stats.total)} publicate în Habitoo: ${breakdown}.`,
    `În Habitoo, ${a.name}${location} prezintă ${offerCount(stats.total)} publicate acum: ${breakdown}.`,
    `Portofoliul public al agenției ${a.name}${location} cuprinde acum ${offerCount(stats.total)}: ${breakdown}.`,
    `La ${a.name}${location}, lista publică din Habitoo include acum ${offerCount(stats.total)}: ${breakdown}.`,
  ]);
  const types = join([...stats.types].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ro"))
    .map(t => TYPE_NAMES[t.value]).filter((t): t is string => Boolean(t)));
  const typeSentence = types ? choose(a.slug, 1, [
    `Tipurile de proprietăți, în ordinea frecvenței în oferte, sunt ${types}.`,
    `Ofertele includ ${types}, enumerate de la cele mai frecvente.`,
    `În lista publicată se regăsesc ${types}, în ordinea numărului de oferte.`,
    `După frecvența în portofoliul public, proprietățile sunt ${types}.`,
  ]) : "";
  const places = join([...stats.places].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ro")).slice(0, 5).map(p => p.value));
  const placeSentence = places ? choose(a.slug, 2, [
    `Principalele localități sau zone cu oferte sunt ${places}.`,
    `Cele mai multe oferte se află în ${places}.`,
    `Lista ofertelor acoperă în principal ${places}.`,
    `După numărul de oferte, principalele localități sau zone sunt ${places}.`,
  ]) : "";
  // Never mix currencies or sale prices with monthly rental prices.
  const ranges = stats.total >= 3 ? stats.prices.filter(p => ["sale", "rent"].includes(p.transaction) && ["EUR", "RON", "USD", "GBP", "CHF"].includes(p.currency))
    .map(p => `${p.transaction === "sale" ? "vânzare" : "închiriere"}: ${amount(p.min)}–${amount(p.max)} ${p.currency}`) : [];
  const priceSentence = ranges.length ? choose(a.slug, 3, [
    `Prețurile cerute în ofertele publicate se încadrează în următoarele intervale (${ranges.join("; ")}).`,
    `Intervalele prețurilor afișate sunt, separat pe tranzacție și monedă, ${ranges.join("; ")}.`,
    `Pentru ofertele cu preț afișat, intervalele sunt ${ranges.join("; ")}.`,
    `Lista publică are următoarele intervale de preț cerut: ${ranges.join("; ")}.`,
  ]) : "";
  const developments = join(stats.developments);
  const developmentSentence = developments ? choose(a.slug, 4, [
    `Agenția are unități publicate în ansamblurile rezidențiale ${developments}.`,
    `Ofertele de unități includ ansamblurile rezidențiale ${developments}.`,
    `În portofoliul public sunt unități din ansamblurile rezidențiale ${developments}.`,
    `Unitățile publicate de agenție aparțin ansamblurilor rezidențiale ${developments}.`,
  ]) : "";
  const contacts = join([a.phone, a.email, a.website].filter((s): s is string => Boolean(s?.trim())));
  const contactSentence = contacts ? choose(a.slug, 5, [
    `Contactul public al agenției: ${contacts}.`,
    `Poți contacta agenția la ${contacts}.`,
    `Pentru contact, agenția afișează ${contacts}.`,
    `Datele publice de contact ale agenției sunt ${contacts}.`,
  ]) : "";
  const opening = `${first} ${typeSentence}`.trim();
  const details = [placeSentence, priceSentence, developmentSentence].filter(Boolean).join(" ");
  const closing = `${contactSentence}${contactSentence ? " " : ""}Vezi mai jos toate ofertele agenției ${a.name.replace(/[.!?]+$/, "")}.`;
  const automaticDescription = [opening, details, closing].filter(Boolean).join("\n\n");
  const own = a.description?.trim();
  return { description: own || automaticDescription, automaticDescription,
    metaDescription: own ? own.slice(0, 160) : agencyDescriptionMeta(first) };
}