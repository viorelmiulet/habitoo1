/**
 * Citirea paginii publice de rezultate Imospot — funcții pure, fără rețea.
 *
 * Structura reală a paginii: fiecare anunț este un `<article>` cu
 * `data-listing-id`, `data-lat` și `data-lon`. Acestea sunt cârligul principal:
 * identificatorul și coordonatele. Înăuntru: adresa anunțului (`/anunturi/...`),
 * prețul într-un `<p>` („99.000 €"), titlul în `<h3>`, localitatea în
 * `<span class="truncate">`, apoi un rând de `<span class="inline-flex
 * items-center gap-1.5">` cu „2 camere" și „50 m²", iar la final agenția și
 * vechimea relativă („azi", „ieri", „2 zile", „o lună").
 *
 * Coordonatele sunt la nivel de zonă, nu de clădire: mai multe anunțuri împart
 * aceeași pereche lat/lon. Se folosesc doar pentru apropiere, niciodată pentru a
 * pretinde o adresă exactă.
 *
 * Imaginile și datele de contact NU sunt citite. Un rezultat fără preț sau fără
 * suprafață este eliminat: fără ele nu poate susține o evaluare.
 */

export type ImospotParsedListing = {
  /** `data-listing-id` — identificatorul public al anunțului la sursă. */
  listingId: string;
  /** `data-lat` — coordonată la nivel de zonă, nu de clădire. */
  latitude: number | null;
  /** `data-lon` — coordonată la nivel de zonă, nu de clădire. */
  longitude: number | null;
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

/** Un cartier descoperit din linkurile paginii, nu ghicit. */
export type ImospotParsedNeighborhood = {
  citySlug: string;
  slug: string;
  label: string;
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

function coordinate(value: string | null, limit: number): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  if (parsed === 0) return null;
  return Math.abs(parsed) <= limit ? parsed : null;
}

/** Textele de vechime pe care sursa le scrie în litere. */
const WORD_COUNTS: Record<string, number> = {
  o: 1,
  un: 1,
  doua: 2,
  două: 2,
  doi: 2,
  trei: 3,
  patru: 4,
  cinci: 5,
  sase: 6,
  șase: 6,
};

const AGE_PATTERN =
  /^(?:azi|astazi|astăzi|ieri|(?:\d+|o|un|doua|două|doi|trei|patru|cinci|sase|șase)\s*(?:zile|zi|saptamani|săptămâni|saptamana|săptămână|luni|luna|lună|ani|an))$/;

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
  const match = value.match(
    /^(\d+|o|un|doua|două|doi|trei|patru|cinci|sase|șase)\s*(zile|zi|saptamani|săptămâni|saptamana|săptămână|luni|luna|lună|ani|an)$/,
  );
  if (!match) return null;
  const rawCount = match[1]!;
  const count = /^\d+$/.test(rawCount) ? Number(rawCount) : WORD_COUNTS[rawCount];
  if (count === undefined || !Number.isFinite(count) || count < 0) return null;
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

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? match[1]!.trim() : null;
}

/** Textele tuturor `<span>`-urilor din card, în ordinea din pagină. */
function spanTexts(card: string): { classes: string; text: string }[] {
  const out: { classes: string; text: string }[] = [];
  for (const match of card.matchAll(/<span([^>]*)>([\s\S]*?)<\/span>/g)) {
    const classes = attribute(`<span${match[1]}>`, "class") ?? "";
    out.push({ classes, text: stripTags(match[2]!) });
  }
  return out;
}

function splitPlace(place: string | null): { locality: string | null; zone: string | null } {
  if (!place) return { locality: null, zone: null };
  const parts = place
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return { locality: null, zone: null };
  if (parts.length === 1) return { locality: parts[0]!, zone: null };
  if (/^sector/i.test(parts[0]!)) return { zone: parts[0]!, locality: parts[1]! };
  return { locality: parts[0]!, zone: parts[1]! };
}

function parseCard(articleTag: string, card: string, now: Date): ImospotParsedListing | null {
  const listingId = attribute(articleTag, "data-listing-id");
  if (!listingId) return null;

  const latitude = coordinate(attribute(articleTag, "data-lat"), 90);
  const longitude = coordinate(attribute(articleTag, "data-lon"), 180);

  // Prețul: primul `<p>` al cardului care conține o sumă în euro.
  let price: number | null = null;
  let monthly = false;
  for (const match of card.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = stripTags(match[1]!);
    const amount = firstMatch(text, /([\d.]+(?:,\d+)?)\s*€/);
    if (!amount) continue;
    const value = roNumber(amount);
    if (value === null || value <= 0) continue;
    price = value;
    monthly = /\/\s*lun/i.test(text);
    break;
  }

  const url = firstMatch(card, /href="([^"]*\/anunturi\/[^"]+)"/);
  const heading = firstMatch(card, /<h3[^>]*>([\s\S]*?)<\/h3>/);
  const title = heading ? stripTags(heading) || null : null;

  const spans = spanTexts(card);

  const place =
    spans.find((s) => /\btruncate\b/.test(s.classes) && /,/.test(s.text))?.text ??
    spans.find((s) => /\btruncate\b/.test(s.classes))?.text ??
    null;
  const { locality, zone } = splitPlace(place);

  const facts = spans.filter((s) => /inline-flex/.test(s.classes));
  let rooms: number | null = null;
  let area: number | null = null;
  for (const fact of facts) {
    if (rooms === null) {
      const roomsText = firstMatch(fact.text, /([\d.,]+)\s*camer/i);
      if (roomsText) rooms = roNumber(roomsText);
    }
    if (area === null) {
      const areaText = firstMatch(fact.text, /([\d.,]+)\s*(?:m²|m2|mp)(?![a-z])/i);
      if (areaText) area = roNumber(areaText);
    }
  }

  // Ultimul rând: agenția și vechimea, în două `<span>`-uri.
  const lastFact = facts.length > 0 ? spans.indexOf(facts[facts.length - 1]!) : -1;
  const tail = spans.slice(lastFact + 1).filter((s) => s.text !== "");
  const ageIndex = tail.findIndex((s) => AGE_PATTERN.test(s.text.toLowerCase()));
  const ageText = ageIndex >= 0 ? tail[ageIndex]!.text : null;
  const agency =
    tail
      .filter((_, index) => index !== ageIndex)
      .map((s) => s.text)
      .find((text) => text !== "" && !/^[\d.,\s€]+$/.test(text)) ?? null;

  // Fără preț sau fără suprafață, rezultatul se aruncă.
  if (price === null || price <= 0) return null;
  if (area === null || area <= 0) return null;

  return {
    listingId,
    latitude,
    longitude,
    url: url ?? null,
    title,
    price,
    currency: "EUR",
    monthly,
    rooms: rooms !== null && rooms > 0 ? Math.round(rooms) : null,
    area,
    locality,
    zone,
    agency,
    ageText,
    listedAt: imospotRelativeDate(ageText, now),
  };
}

/** Rezultatele unei pagini de listă. */
export function parseImospotListings(
  html: string,
  now: Date = new Date(),
): ImospotParsedListing[] {
  const out: ImospotParsedListing[] = [];
  const parts = html.split(/(?=<article\b)/);
  for (const raw of parts) {
    if (!/^<article\b/.test(raw)) continue;
    const articleTag = raw.match(/^<article[^>]*>/)?.[0] ?? "";
    if (!/data-listing-id="/.test(articleTag)) continue;
    const end = raw.indexOf("</article>");
    const card = end >= 0 ? raw.slice(0, end) : raw;
    const parsed = parseCard(articleTag, card, now);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Cartierele pe care pagina însăși le publică, ca linkuri
 * `/toate-ofertele-din-<oraș>/<cartier>`. Se citesc de acolo, nu se ghicesc.
 */
export function parseImospotNeighborhoods(html: string): ImospotParsedNeighborhood[] {
  const seen = new Set<string>();
  const out: ImospotParsedNeighborhood[] = [];
  for (const match of html.matchAll(
    /<a[^>]+href="[^"]*\/toate-ofertele-din-([a-z0-9-]+)\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const citySlug = match[1]!.toLowerCase();
    const slug = match[2]!.toLowerCase();
    // Eticheta afișată, fără contorul de oferte din link.
    const label = stripTags(match[3]!)
      .replace(/\(\s*[\d.,]+\s*\)\s*$/, "")
      .replace(/[\d.,]+\s*(?:oferte|anunțuri|anunturi)\s*$/i, "")
      .replace(/\s*[\d.,]+\s*$/, "")
      .trim();
    if (label === "") continue;
    const key = `${citySlug}/${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ citySlug, slug, label });
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
  const timeOnMarket = firstMatch(
    text,
    /([\d.,]+\s*(?:luni|luna|lună|zile|zi|ani|an))\s*stă o proprietate pe piață/,
  );
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
