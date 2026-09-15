/**
 * Validarea factuală a conținutului de marketing (Stage 16) — modul pur.
 *
 * Regula: marketingul poate schimba TONUL, niciodată FAPTELE. Tot ce apare în
 * textul generat și seamănă cu o informație factuală (suprafață, camere, etaj,
 * an, preț, distanțe, facilități de zonă) este verificat împotriva „fișei de
 * fapte” construite server-side din datele proprietății. Ce nu există în date
 * este marcat ca invenție, nu publicat.
 *
 * Modulul nu inventează și nu completează nimic: datele lipsă devin întrebări
 * pentru utilizator.
 */

export type MarketingFactNumbers = {
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  buildingFloors: number | null;
  buildYear: number | null;
  renovationYear: number | null;
  usableSurface: number | null;
  builtSurface: number | null;
  landSurface: number | null;
  balconySurface: number | null;
  terraceSurface: number | null;
  parkingSpaces: number | null;
  price: number | null;
};

export type MarketingFactSheet = {
  propertyId: string;
  reference: string | null;
  transaction: "sale" | "rent" | null;
  propertyType: string | null;
  status: string | null;
  currency: string | null;
  numbers: MarketingFactNumbers;
  location: { city: string | null; county: string | null; district: string | null };
  /** Dotări și caracteristici existente în fișa proprietății. */
  features: string[];
  /** Textul liber deja existent (descriere), folosit doar ca sursă de fapte. */
  existingText: string | null;
  imageCount: number;
};

export type MarketingFactIssueType =
  | "invented_number"
  | "unverifiable_claim"
  | "banned_claim"
  | "channel_limit";

export type MarketingFactIssue = {
  type: MarketingFactIssueType;
  severity: "error" | "warning";
  /** Fragmentul din text care a declanșat problema. */
  claim: string;
  message: string;
};

export type MarketingValidation = {
  status: "valid" | "warning" | "invalid";
  issues: MarketingFactIssue[];
};

const NUMBER_FIELDS: (keyof MarketingFactNumbers)[] = [
  "rooms",
  "bedrooms",
  "bathrooms",
  "floor",
  "buildingFloors",
  "buildYear",
  "renovationYear",
  "usableSurface",
  "builtSurface",
  "landSurface",
  "balconySurface",
  "terraceSurface",
  "parkingSpaces",
  "price",
];

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  }
  return [];
}

/** Fișa de fapte: singurul adevăr pe care se poate baza conținutul generat. */
export function buildMarketingFactSheet(row: Record<string, unknown>): MarketingFactSheet {
  const featureKeys = [
    "features",
    "utilities",
    "building_amenities",
    "appliances",
    "kitchen_features",
    "additional_spaces",
    "heating_systems",
    "cooling_systems",
    "views",
    "misc_features",
    "street_arrangement",
    "tags",
  ];
  const features = featureKeys.flatMap((key) => textList(row[key]));
  const transaction = row["transaction_kind"];

  return {
    propertyId: String(row["id"] ?? ""),
    reference: typeof row["reference"] === "string" ? row["reference"] : null,
    transaction: transaction === "sale" || transaction === "rent" ? transaction : null,
    propertyType: typeof row["property_type"] === "string" ? row["property_type"] : null,
    status: typeof row["status"] === "string" ? row["status"] : null,
    currency: typeof row["currency"] === "string" ? row["currency"] : null,
    numbers: {
      rooms: toNumber(row["rooms"]),
      bedrooms: toNumber(row["bedrooms"]),
      bathrooms: toNumber(row["bathrooms"]),
      floor: toNumber(row["floor"]),
      buildingFloors: toNumber(row["building_floors"]),
      buildYear: toNumber(row["build_year"]),
      renovationYear: toNumber(row["renovation_year"]),
      usableSurface: toNumber(row["usable_surface"]) ?? toNumber(row["surface"]),
      builtSurface: toNumber(row["built_surface"]),
      landSurface: toNumber(row["land_surface"]),
      balconySurface: toNumber(row["balcony_surface"]),
      terraceSurface: toNumber(row["terrace_surface"]),
      parkingSpaces: toNumber(row["parking_spaces"]),
      price: toNumber(row["price"]),
    },
    location: {
      city: typeof row["city"] === "string" ? row["city"] : null,
      county: typeof row["county"] === "string" ? row["county"] : null,
      district: typeof row["district"] === "string" ? row["district"] : null,
    },
    features,
    existingText: typeof row["description"] === "string" ? row["description"] : null,
    imageCount: toNumber(row["image_count"]) ?? 0,
  };
}

/** Afirmații care nu pot fi susținute de date: promisiuni, garanții, superlative. */
const BANNED_CLAIMS: { pattern: RegExp; message: string }[] = [
  { pattern: /garant(at|ăm|am|ie)/i, message: "Promisiune de garanție." },
  { pattern: /cea mai bun[ăa] investi[țt]ie/i, message: "Superlativ nesusținut de date." },
  { pattern: /randament/i, message: "Randament estimat, inexistent în date." },
  { pattern: /profit (sigur|garantat|rapid)/i, message: "Promisiune de profit." },
  {
    pattern: /(valoarea|pre[țt]ul) (va cre[șs]te|se va dubla|cre[șs]te sigur)/i,
    message: "Predicție de preț.",
  },
  { pattern: /f[ăa]r[ăa] riscuri/i, message: "Afirmație de risc zero." },
  { pattern: /unic[ăa]? (pe pia[țt][ăa]|în ora[șs])/i, message: "Superlativ nesusținut de date." },
  { pattern: /cel mai (ieftin|bun|mare) (din|de pe)/i, message: "Superlativ nesusținut de date." },
  { pattern: /se vinde (imediat|într-o zi)/i, message: "Promisiune de vânzare." },
  { pattern: /oportunitate unic[ăa]/i, message: "Superlativ nesusținut de date." },
];

/** Facilități de vecinătate: se pot menționa doar dacă apar în datele proprietății. */
const NEIGHBOURHOOD_KEYWORDS = [
  "metrou",
  "tramvai",
  "autobuz",
  "troleibuz",
  "școal",
  "scoal",
  "grădinit",
  "gradinit",
  "liceu",
  "universitat",
  "spital",
  "policlinic",
  "mall",
  "centru comercial",
  "supermarket",
  "parc",
  "lac",
  "pădure",
  "padure",
  "plaj",
  "aeroport",
  "gară",
  "gara",
  "stadion",
  "piscin",
];

/** Distanțe și timpi de deplasare: Habitoo nu stochează astfel de date. */
const DISTANCE_PATTERN =
  /(\d+\s*(?:minute|min\.?|km|kilometri)|la\s+\d+\s*(?:metri|m)\b|\d+\s*m\s+de\s+)/gi;

const SURFACE_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:mp|m2|m²|metri p[ăa]tra[țt]i)/gi;
const ROOMS_PATTERN = /(\d+)\s*camer[ăae]/gi;
const BEDROOMS_PATTERN = /(\d+)\s*dormitoar?e?/gi;
const BATHROOMS_PATTERN = /(\d+)\s*(?:b[ăa]i|b[ăa]ie|grupuri sanitare)/gi;
const FLOOR_PATTERN = /etaj(?:ul)?\s*(\d+)/gi;
const PARKING_PATTERN = /(\d+)\s*(?:locuri|loc)\s*de\s*parcare/gi;
const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/g;
const PRICE_PATTERN = /(\d[\d.\s]{2,})\s*(?:€|eur\b|euro\b|lei\b|ron\b)/gi;

function allowed(values: (number | null)[], candidate: number, tolerance = 0.99): boolean {
  return values.some((value) => value !== null && Math.abs(value - candidate) <= tolerance);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function factEvidence(facts: MarketingFactSheet): string {
  return normalizeText(
    [
      facts.propertyType ?? "",
      facts.location.city ?? "",
      facts.location.county ?? "",
      facts.location.district ?? "",
      facts.existingText ?? "",
      ...facts.features,
    ].join(" | "),
  );
}

function priceNumbers(facts: MarketingFactSheet): (number | null)[] {
  const price = facts.numbers.price;
  if (price === null) return [];
  // Prețul poate apărea rotunjit („145.000”, „145 mii”): acceptăm valoarea
  // exactă și rotunjirea la mie, nimic altceva.
  return [price, Math.round(price / 1000) * 1000, Math.round(price / 1000)];
}

function surfaceNumbers(facts: MarketingFactSheet): (number | null)[] {
  const n = facts.numbers;
  return [
    n.usableSurface,
    n.builtSurface,
    n.landSurface,
    n.balconySurface,
    n.terraceSurface,
  ];
}

function collect(pattern: RegExp, text: string): { value: number; claim: string }[] {
  const out: { value: number; claim: string }[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    const raw = (match[1] ?? "").replace(/[.\s]/g, "").replace(",", ".");
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ value, claim: match[0].trim() });
    match = regex.exec(text);
  }
  return out;
}

/**
 * Validează un text de marketing împotriva fișei de fapte.
 * Orice cifră sau facilitate care nu există în date devine eroare: rezultatul
 * este marcat invalid și nu poate fi salvat ca ciornă utilizabilă.
 */
export function validateMarketingFacts(
  text: string,
  facts: MarketingFactSheet,
): MarketingValidation {
  const issues: MarketingFactIssue[] = [];
  const evidence = factEvidence(facts);

  for (const banned of BANNED_CLAIMS) {
    const match = banned.pattern.exec(text);
    if (match) {
      issues.push({
        type: "banned_claim",
        severity: "error",
        claim: match[0],
        message: banned.message,
      });
    }
  }

  const numericChecks: {
    pattern: RegExp;
    values: (number | null)[];
    label: string;
  }[] = [
    { pattern: SURFACE_PATTERN, values: surfaceNumbers(facts), label: "suprafață" },
    { pattern: ROOMS_PATTERN, values: [facts.numbers.rooms], label: "număr de camere" },
    { pattern: BEDROOMS_PATTERN, values: [facts.numbers.bedrooms], label: "număr de dormitoare" },
    { pattern: BATHROOMS_PATTERN, values: [facts.numbers.bathrooms], label: "număr de băi" },
    { pattern: FLOOR_PATTERN, values: [facts.numbers.floor], label: "etaj" },
    { pattern: PARKING_PATTERN, values: [facts.numbers.parkingSpaces], label: "locuri de parcare" },
    {
      pattern: YEAR_PATTERN,
      values: [facts.numbers.buildYear, facts.numbers.renovationYear],
      label: "an",
    },
    { pattern: PRICE_PATTERN, values: priceNumbers(facts), label: "preț" },
  ];

  for (const check of numericChecks) {
    for (const found of collect(check.pattern, text)) {
      if (allowed(check.values, found.value)) continue;
      issues.push({
        type: "invented_number",
        severity: "error",
        claim: found.claim,
        message: `Valoare inexistentă în fișa proprietății (${check.label}).`,
      });
    }
  }

  const normalized = normalizeText(text);
  for (const keyword of NEIGHBOURHOOD_KEYWORDS) {
    const key = normalizeText(keyword);
    if (!normalized.includes(key)) continue;
    if (evidence.includes(key)) continue;
    issues.push({
      type: "unverifiable_claim",
      severity: "error",
      claim: keyword,
      message: "Facilitate de zonă care nu apare în datele proprietății.",
    });
  }

  const distanceMatches = text.match(DISTANCE_PATTERN);
  if (distanceMatches) {
    for (const claim of new Set(distanceMatches.map((item) => item.trim()))) {
      issues.push({
        type: "unverifiable_claim",
        severity: "error",
        claim,
        message: "Distanță sau timp de deplasare care nu există în date.",
      });
    }
  }

  const status = issues.some((issue) => issue.severity === "error")
    ? "invalid"
    : issues.length > 0
      ? "warning"
      : "valid";
  return { status, issues };
}

/** Verificarea limitelor de canal: avertisment, nu invenție factuală. */
export function validateMarketingLimits(
  content: { title: string | null; body: string },
  limits: { maxTitle: number; maxBody: number },
): MarketingFactIssue[] {
  const issues: MarketingFactIssue[] = [];
  if (content.title && content.title.length > limits.maxTitle) {
    issues.push({
      type: "channel_limit",
      severity: "warning",
      claim: content.title.slice(0, 40),
      message: `Titlul depășește limita canalului (${limits.maxTitle} de caractere).`,
    });
  }
  if (content.body.length > limits.maxBody) {
    issues.push({
      type: "channel_limit",
      severity: "warning",
      claim: `${content.body.length} caractere`,
      message: `Textul depășește limita canalului (${limits.maxBody} de caractere).`,
    });
  }
  return issues;
}

/** Combină validările și păstrează cea mai severă concluzie. */
export function mergeMarketingValidation(
  base: MarketingValidation,
  extra: MarketingFactIssue[],
): MarketingValidation {
  const issues = [...base.issues, ...extra];
  const status = issues.some((issue) => issue.severity === "error")
    ? "invalid"
    : issues.length > 0
      ? "warning"
      : "valid";
  return { status, issues };
}

export type MarketingMissingField = { field: string; question: string };

/** Date lipsă prezentate ca ÎNTREBĂRI, niciodată completate prin presupuneri. */
export function missingMarketingData(facts: MarketingFactSheet): MarketingMissingField[] {
  const out: MarketingMissingField[] = [];
  const n = facts.numbers;
  if (n.usableSurface === null && n.builtSurface === null && n.landSurface === null) {
    out.push({ field: "surface", question: "Care este suprafața proprietății?" });
  }
  if (n.rooms === null) out.push({ field: "rooms", question: "Câte camere are proprietatea?" });
  if (n.price === null) out.push({ field: "price", question: "Care este prețul cerut?" });
  if (n.floor === null && facts.propertyType === "apartment") {
    out.push({ field: "floor", question: "La ce etaj se află apartamentul?" });
  }
  if (n.buildYear === null) {
    out.push({ field: "buildYear", question: "În ce an a fost construită clădirea?" });
  }
  if (facts.location.district === null) {
    out.push({ field: "district", question: "În ce zonă sau cartier se află proprietatea?" });
  }
  if (facts.features.length === 0) {
    out.push({ field: "features", question: "Ce dotări și facilități are proprietatea?" });
  }
  if (facts.imageCount === 0) {
    out.push({ field: "images", question: "Există fotografii care pot însoți anunțul?" });
  }
  return out;
}

/** Amprentă stabilă a contextului: leagă ciorna de datele exacte folosite. */
export function marketingContextHash(facts: MarketingFactSheet): string {
  const payload = JSON.stringify({
    id: facts.propertyId,
    t: facts.transaction,
    p: facts.propertyType,
    n: NUMBER_FIELDS.map((field) => facts.numbers[field]),
    l: facts.location,
    f: [...facts.features].sort(),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `mkt-${hash.toString(16)}`;
}
