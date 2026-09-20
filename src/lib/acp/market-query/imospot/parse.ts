/**
 * Citirea paginii publice de rezultate Imospot — funcții pure, fără rețea.
 *
 * Se citesc doar câmpurile de care are nevoie o analiză: adresa anunțului,
 * titlul, prețul și moneda, camerele, suprafața, localitatea/sectorul afișat,
 * agenția și vechimea relativă („azi", „ieri", „2 zile"), transformată în dată.
 * Imaginile și datele de contact NU sunt citite. Un rezultat fără preț sau fără
 * suprafață este eliminat: fără ele nu poate susține o evaluare.
 */

export type ImospotParsedListing = {
  url: string | null;
  title: string | null;
  price: number;
  currency: string;
  /** `true` când prețul este o chirie lunară („/lună" la sursă). */
  monthly: boolean;
  rooms: number | null;
  area: number;
  locality: string | null;
  zone: string | null;
  agency: string | null;
  /** Vechimea relativă, exact cum o scrie sursa. */
  ageText: string | null;
  listedAt: string | null;
};

/** Cifrele publicate de sursă pentru un oraș — statistica LOR, nu a noastră. */
export type ImospotMarketContext = {
  cityLabel: string | null;
  activeListings: number | null;
  medianPricePerSqm: number | null;
  medianPrice: number | null;
  medianRent: number | null;
  rentListings: number | null;
  /** Timpul mediu pe piață, exact cum îl scrie sursa („4 luni"). */
  timeOnMarketText: string | null;
  byRooms: { label: string; count: number }[];
  byType: { label: string; count: number }[];
  /** Nota explicativă publicată de sursă, păstrată ca text. */
  note: string | null;
  currency: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** „2.000" → 2000 · „111.999" → 111999 · „1.661,5" → 1661.5 */
function roNumber(value: string): number | null {
  const cleaned = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Vechimea relativă → dată calendaristică. Ce nu înțelegem rămâne gol,
 * niciodată aproximat.
 */
export function imospotRelativeDate(
  text: string | null,
  now: Date = new Date(),
): string | null {
  if (!text) return null;
  const value = text.trim().toLowerCase();
  const day = 24 * 60 * 60 * 1000;
  const shift = (days: number) => new Date(now.getTime() - days * day).toISOString();
  if (value === "azi" || value === "astazi" || value === "astăzi") return shift(0);
  if (value === "ieri") return shift(1);
  const match = value.match(/^(\d+)\s*(zile|zi|saptamani|săptămâni|luni|luna|lună|ani|an)$/);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count < 0) return null;
  const unit = match[2]!;
  if (unit.startsWith("zi")) return shift(count);
  if (unit.startsWith("sapt") || unit.startsWith("săpt")) return shift(count * 7);
  if (unit.startsWith("lun")) return shift(count * 30);
  return shift(count * 365);
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match && match[1] !== undefined ? match[1]!.trim() : null;
}

function parseCard(card: string, now: Date): ImospotParsedListing | null {
  const priceBlock = firstMatch(card, /leading-none">\s*([\s\S]*?)<\/p>/);
  if (!priceBlock) return null;
  const priceText = stripTags(priceBlock);
  const priceValue = firstMatch(priceText, /([\d.,]+)\s*€/);
  const price = priceValue ? roNumber(priceValue) : null;
  const monthly = /\/\s*lună/i.test(priceText);

  const url = firstMatch(card, /<a href="([^"]*\/anunturi\/[^"]+)"/);
  const title = (() => {
    const heading = firstMatch(card, /<h3[^>]*>([\s\S]*?)<\/h3>/);
    return heading ? stripTags(heading) || null : null;
  })();

  const facts = stripTags(
    card.match(/<div class="mt-3 flex items-center gap-4[\s\S]*?<\/div>/)?.[0] ?? "",
  );
  const roomsText = firstMatch(facts, /([\d.,]+)\s*camer/i);
  const areaText = firstMatch(facts, /([\d.,]+)\s*m²/i);
  const rooms = roomsText ? roNumber(roomsText) : null;
  const area = areaText ? roNumber(areaText) : null;

  const place = firstMatch(card, /<span class="truncate">([^<]*)<\/span>/);
  let locality: string | null = null;
  let zone: string | null = null;
  if (place) {
    const parts = place
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    if (parts.length >= 2) {
      if (/^sector/i.test(parts[0]!)) {
        zone = parts[0]!;
        locality = parts[1]!;
      } else {
        locality = parts[0]!;
        zone = null;
      }
    } else if (parts.length === 1) {
      locality = parts[0]!;
    }
  }

  const agency = firstMatch(card, /font-medium[^"]*truncate">\s*([^<]*)<\/span>/);
  const ageText = firstMatch(card, /shrink-0">\s*([^<]*)<\/span>/);

  // Fără preț sau fără suprafață, rezultatul se aruncă.
  if (price === null || price <= 0) return null;
  if (area === null || area <= 0) return null;

  return {
    url: url ?? null,
    title,
    price,
    currency: "EUR",
    monthly,
    rooms: rooms !== null && rooms > 0 ? Math.round(rooms) : null,
    area,
    locality,
    zone,
    agency: agency && agency !== "" ? agency : null,
    ageText: ageText && ageText !== "" ? ageText : null,
    listedAt: imospotRelativeDate(ageText, now),
  };
}

/** Rezultatele unei pagini de listă. */
export function parseImospotListings(
  html: string,
  now: Date = new Date(),
): ImospotParsedListing[] {
  const cards = html
    .split(/(?=<article\s+data-listing-id=)/)
    .filter((part) => /^<article\s+data-listing-id=/.test(part));
  const out: ImospotParsedListing[] = [];
  for (const raw of cards) {
    const end = raw.indexOf("</article>");
    const card = end >= 0 ? raw.slice(0, end) : raw;
    const parsed = parseCard(card, now);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Blocul de cifre publicate de sursă („Piața din … în cifre"). Se citește
 * separat de comparabilele noastre și nu intră în niciun calcul.
 */
export function parseImospotMarketContext(html: string): ImospotMarketContext | null {
  const index = html.indexOf("zona-piata");
  if (index < 0) return null;
  const text = stripTags(html.slice(Math.max(0, index - 400), index + 9000));

  const cityLabel = firstMatch(text, /Piața din ([^,]+?), în cifre/);
  const activeText = firstMatch(text, /Calculat din cele ([\d.,]+) proprietăți active/);
  const perSqmText = firstMatch(text, /([\d.,]+)\s*€\s*\/m²\s*preț median la vânzare/);
  const medianText = firstMatch(text, /([\d.,]+)\s*€\s*preț median al unei proprietăți/);
  const rentMatch = text.match(/([\d.,]+)\s*€\s*\/lună\s*chirie mediană\s*\(([\d.,]+) oferte\)/);
  const timeOnMarket = firstMatch(text, /([\d.,]+\s*(?:luni|luna|lună|zile|zi|ani|an))\s*stă o proprietate pe piață/);
  const note = firstMatch(text, /(Prețul pe metru pătrat[^|]*?)(?:Pe camere:|Tipuri:|Caută pe cartiere|$)/);

  const byRooms: { label: string; count: number }[] = [];
  const roomsBlock = firstMatch(text, /Pe camere:\s*([^|]*?)(?:Tipuri:|Caută pe cartiere|$)/);
  if (roomsBlock) {
    for (const m of roomsBlock.matchAll(/([\d.,]+)\s*×\s*([^,]+?)(?:,|$)/g)) {
      const count = roNumber(m[1]!);
      const label = m[2]!.trim();
      if (count !== null && label !== "") byRooms.push({ label, count });
    }
  }

  const byType: { label: string; count: number }[] = [];
  const typeBlock = firstMatch(text, /Tipuri:\s*([^|]*?)(?:Caută pe cartiere|$)/);
  if (typeBlock) {
    for (const m of typeBlock.matchAll(/([^,(]+?)\s*\(([\d.,]+)\)/g)) {
      const count = roNumber(m[2]!);
      const label = m[1]!.trim();
      if (count !== null && label !== "") byType.push({ label, count });
    }
  }

  const context: ImospotMarketContext = {
    cityLabel,
    activeListings: activeText ? roNumber(activeText) : null,
    medianPricePerSqm: perSqmText ? roNumber(perSqmText) : null,
    medianPrice: medianText ? roNumber(medianText) : null,
    medianRent: rentMatch ? roNumber(rentMatch[1]!) : null,
    rentListings: rentMatch ? roNumber(rentMatch[2]!) : null,
    timeOnMarketText: timeOnMarket,
    byRooms,
    byType,
    note,
    currency: "EUR",
  };

  const hasAnything =
    context.medianPricePerSqm !== null ||
    context.medianPrice !== null ||
    context.medianRent !== null ||
    context.activeListings !== null;
  return hasAnything ? context : null;
}
