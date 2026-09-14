/**
 * Natural language → filtre CRM deterministe (Stage 14).
 *
 * Modulul este PUR: nu atinge baza de date și nu apelează providerul. Traduce
 * formulările uzuale în limba română în filtre reproductibile, ca rezultatele
 * să nu depindă de model. Modelul poate folosi filtrele, dar nu le inventează:
 * dacă un criteriu nu apare în text, câmpul rămâne `null`.
 */

export type CrmIntent =
  | "leads_without_followup"
  | "leads_stale"
  | "priorities"
  | "active_clients"
  | "new_properties"
  | "today_activity"
  | "imported_prospects"
  | "client_matching"
  | "search";

export type CrmFilters = {
  intent: CrmIntent;
  /** Zile fără activitate/contact, dacă textul le precizează. */
  days: number | null;
  city: string | null;
  roomsMin: number | null;
  roomsMax: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  stage: string | null;
  source: string | null;
  propertyType: string | null;
  transaction: "sale" | "rent" | null;
  /** `true` doar când utilizatorul cere explicit „ale mele”. */
  mineOnly: boolean;
  keywords: string[];
};

const CITY_HINTS = [
  "bucurești",
  "bucuresti",
  "cluj",
  "cluj-napoca",
  "timișoara",
  "timisoara",
  "iași",
  "iasi",
  "brașov",
  "brasov",
  "constanța",
  "constanta",
  "oradea",
  "sibiu",
  "craiova",
  "ploiești",
  "ploiesti",
  "arad",
  "pitești",
  "pitesti",
  "galați",
  "galati",
  "bacău",
  "bacau",
];

const STAGE_HINTS: Record<string, string> = {
  nou: "new",
  noi: "new",
  contactat: "contacted",
  contactate: "contacted",
  calificat: "qualified",
  calificate: "qualified",
  vizionare: "viewing",
  ofertă: "offer",
  oferta: "offer",
  negociere: "negotiation",
  tranzacție: "transaction",
  tranzactie: "transaction",
  câștigat: "won",
  castigat: "won",
  pierdut: "lost",
  pierdute: "lost",
};

const PROPERTY_TYPE_HINTS: Record<string, string> = {
  apartament: "apartment",
  apartamente: "apartment",
  garsonier: "studio",
  casă: "house",
  casa: "house",
  case: "house",
  teren: "land",
  terenuri: "land",
  spațiu: "commercial",
  spatiu: "commercial",
  birou: "office",
  birouri: "office",
  hală: "industrial",
  hala: "industrial",
};

const STOP_WORDS = new Set([
  "arată",
  "arata",
  "mi",
  "care",
  "ce",
  "sunt",
  "care",
  "din",
  "de",
  "la",
  "în",
  "in",
  "pe",
  "cu",
  "și",
  "si",
  "sau",
  "am",
  "au",
  "mai",
  "nu",
  "fără",
  "fara",
  "doar",
  "toate",
  "toți",
  "toti",
  "azi",
  "zile",
  "clienți",
  "clienti",
  "lead",
  "leaduri",
  "lead-uri",
  "proprietăți",
  "proprietati",
  "cereri",
]);

function stripDiacritics(value: string): string {
  return value
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t");
}

/** Numerele scrise cu separatori („100.000 EUR”, „100 000”) devin valori reale. */
function parseAmount(raw: string): number | null {
  const clean = raw.replace(/[.\s]/g, "").replace(",", ".");
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detectCity(text: string): string | null {
  for (const city of CITY_HINTS) {
    if (text.includes(city)) return city;
  }
  const zone = /(?:în|in|din|zona)\s+([A-ZĂÂÎȘȚ][\wăâîșț-]{2,})/u.exec(text);
  return zone?.[1] ? zone[1].toLowerCase() : null;
}

function detectIntent(text: string): CrmIntent {
  const t = stripDiacritics(text);
  if (/(follow ?up|followup)/.test(t) && /(fara|nu au|nu a|lipsa)/.test(t)) {
    return "leads_without_followup";
  }
  if (/(fara activitate|nu au mai fost contactat|nu a fost contactat|necontactat|stagnant|blocat)/.test(t)) {
    return "leads_stale";
  }
  if (/(prioritar|prioritati|prioritate|azi|urgent)/.test(t) && !/activitate de azi/.test(t)) {
    return "priorities";
  }
  if (/(activitatea de azi|activitati de azi|agenda)/.test(t)) return "today_activity";
  if (/(prospect|prospectare)/.test(t)) return "imported_prospects";
  if (/(se potrivesc|potrivire|matching|match)/.test(t)) return "client_matching";
  if (/(clienti activi|clientii mei|clienti mei)/.test(t)) return "active_clients";
  if (/(proprietati noi|proprietati adaugate|listari noi)/.test(t)) return "new_properties";
  return "search";
}

/** Traduce o cerere în limbaj natural în filtre CRM deterministe. */
export function parseCrmQuery(raw: string): CrmFilters {
  const text = (raw ?? "").toLowerCase().trim();
  const plain = stripDiacritics(text);

  const daysMatch = /(\d{1,3})\s*(zile|zi)/.exec(plain);
  const days = daysMatch?.[1] ? Number(daysMatch[1]) : null;

  const roomsExact = /(\d{1,2})\s*camer/.exec(plain);
  const roomsMinMatch = /(?:minim|peste|cel putin)\s*(\d{1,2})\s*camer/.exec(plain);

  const under = /(?:sub|pana la|maxim|max)\s*([\d.,\s]{3,12})/.exec(plain);
  const over = /(?:peste|minim|de la)\s*([\d.,\s]{3,12})\s*(?:eur|euro|€|ron|lei)/.exec(plain);

  let stage: string | null = null;
  for (const [word, value] of Object.entries(STAGE_HINTS)) {
    if (text.includes(word)) {
      stage = value;
      break;
    }
  }

  let propertyType: string | null = null;
  for (const [word, value] of Object.entries(PROPERTY_TYPE_HINTS)) {
    if (text.includes(word)) {
      propertyType = value;
      break;
    }
  }

  const transaction: CrmFilters["transaction"] = /(inchiriere|chirie|de inchiriat)/.test(plain)
    ? "rent"
    : /(vanzare|de vanzare|cumpar)/.test(plain)
      ? "sale"
      : null;

  const intent = detectIntent(text);

  const keywords = plain
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
    .slice(0, 6);

  return {
    intent,
    days: days !== null && days > 0 && days <= 365 ? days : null,
    city: detectCity(text),
    roomsMin: roomsMinMatch?.[1]
      ? Number(roomsMinMatch[1])
      : roomsExact?.[1]
        ? Number(roomsExact[1])
        : null,
    roomsMax: roomsMinMatch ? null : roomsExact?.[1] ? Number(roomsExact[1]) : null,
    minPrice: over?.[1] ? parseAmount(over[1]) : null,
    maxPrice: under?.[1] ? parseAmount(under[1]) : null,
    stage,
    source: /(prospect|prospectare)/.test(plain) ? "prospecting" : null,
    propertyType,
    transaction,
    mineOnly: /(mele|meu|mei|mi-am|imi)/.test(plain),
    keywords,
  };
}

/** Numărul de zile folosit când utilizatorul cere „fără follow-up” fără cifră. */
export const CRM_DEFAULT_STALE_DAYS = 7;

/** Fereastra implicită pentru „proprietăți noi”. */
export const CRM_DEFAULT_NEW_DAYS = 14;
