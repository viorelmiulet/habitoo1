/**
 * Selectoarele OLX — singurul loc care „știe” cum arată pagina publică.
 *
 * Dacă markup-ul se schimbă, se repară DOAR acest fișier. Parserul este pur
 * (fără DOM, ca să ruleze și în worker) și tolerant: un card din care lipsesc
 * câmpuri obligatorii este raportat ca eșec de citire, nu salvat pe jumătate.
 *
 * Telefoanele NU sunt citite: nu există nicio expresie și niciun câmp de
 * telefon în acest modul (garantat și de test).
 */

export type OlxRawCard = {
  html: string;
  url: string | null;
  sourceItemId: string | null;
  title: string | null;
  priceText: string | null;
  locationDateText: string | null;
  categoryText: string | null;
  sellerBadgeText: string | null;
  paramsText: string[];
  imageUrls: string[];
};

export type OlxParseFailure = { reason: string; snippet: string };

const CARD_SPLIT = /<div[^>]+data-cy=["']l-card["'][^>]*>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function text(html: string | null | undefined): string | null {
  if (!html) return null;
  const stripped = decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "" ? null : stripped;
}

function attr(html: string, attribute: string): string | null {
  const match = new RegExp(`${attribute}=["']([^"']+)["']`, "i").exec(html);
  return match?.[1] ?? null;
}

function byTestId(html: string, testId: string): string | null {
  const pattern = new RegExp(
    `<([a-z]+)[^>]+data-testid=["']${testId}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i",
  );
  return text(pattern.exec(html)?.[2] ?? null);
}

/** Cardurile de anunț dintr-o pagină de listă publică. */
export function splitOlxCards(body: string): string[] {
  const cards: string[] = [];
  const indices: number[] = [];
  CARD_SPLIT.lastIndex = 0;
  let match: RegExpExecArray | null = CARD_SPLIT.exec(body);
  while (match) {
    indices.push(match.index);
    match = CARD_SPLIT.exec(body);
  }
  for (let i = 0; i < indices.length; i += 1) {
    const start = indices[i]!;
    const end = i + 1 < indices.length ? indices[i + 1]! : body.length;
    cards.push(body.slice(start, end));
  }
  return cards;
}

export function readOlxCard(html: string, baseUrl: string): OlxRawCard {
  const link = /<a[^>]+href=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] ?? null;
  let url: string | null = null;
  if (link) {
    try {
      url = new URL(decodeEntities(link), baseUrl).toString();
    } catch {
      url = null;
    }
  }

  const images: string[] = [];
  const imgPattern = /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let img: RegExpExecArray | null = imgPattern.exec(html);
  while (img) {
    const candidate = decodeEntities(img[1] ?? "");
    // Doar adresa imaginii este reținută; nimic nu este descărcat.
    if (/^https?:\/\//i.test(candidate) && !images.includes(candidate)) images.push(candidate);
    img = imgPattern.exec(html);
  }

  const params: string[] = [];
  const paramPattern = /data-testid=["']ad-card-params["'][^>]*>([\s\S]*?)<\/div>/gi;
  let param: RegExpExecArray | null = paramPattern.exec(html);
  while (param) {
    const spanPattern = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let span: RegExpExecArray | null = spanPattern.exec(param[1] ?? "");
    while (span) {
      const value = text(span[1]);
      if (value) params.push(value);
      span = spanPattern.exec(param[1] ?? "");
    }
    if (params.length === 0) {
      const value = text(param[1]);
      if (value) params.push(value);
    }
    param = paramPattern.exec(html);
  }

  return {
    html,
    url,
    sourceItemId: attr(html, "id") ?? (url ? olxItemIdFromUrl(url) : null),
    title: byTestId(html, "ad-card-title"),
    priceText: byTestId(html, "ad-price"),
    locationDateText: byTestId(html, "location-date"),
    categoryText: byTestId(html, "ad-card-category") ?? attr(html, "data-category"),
    sellerBadgeText: byTestId(html, "seller-type") ?? byTestId(html, "business-label"),
    paramsText: params,
    imageUrls: images,
  };
}

/** `…/d/oferta/titlu-IDabc123.html` → `abc123`. */
export function olxItemIdFromUrl(url: string): string | null {
  const match = /-ID([A-Za-z0-9]+)\.html/.exec(url);
  if (match?.[1]) return match[1];
  const fallback = /\/([A-Za-z0-9]{6,})\.html/.exec(url);
  return fallback?.[1] ?? null;
}

/* --------------------------- valori din text ----------------------------- */

export function parseOlxPrice(input: string | null): { price: number | null; currency: string | null } {
  if (!input) return { price: null, currency: null };
  const normalized = decodeEntities(input).replace(/\s+/g, " ");
  const currency = /€|eur/i.test(normalized)
    ? "EUR"
    : /lei|ron/i.test(normalized)
      ? "RON"
      : null;
  const digits = normalized.replace(/[^\d.,]/g, "");
  if (!digits) return { price: null, currency };
  const cleaned = digits.replace(/\.(?=\d{3}\b)/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number.parseFloat(cleaned);
  return { price: Number.isFinite(value) ? value : null, currency };
}

/** „București, Sectorul 3 - Reactualizat 12 septembrie 2026” */
export function parseOlxLocationDate(input: string | null): {
  city: string | null;
  neighbourhood: string | null;
  publishedText: string | null;
} {
  if (!input) return { city: null, neighbourhood: null, publishedText: null };
  const [placePart, datePart] = decodeEntities(input).split(/\s+-\s+/);
  const places = (placePart ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: places[0] ?? null,
    neighbourhood: places.length > 1 ? places.slice(1).join(", ") : null,
    publishedText: datePart?.trim() ?? null,
  };
}

const MONTHS: Record<string, number> = {
  ianuarie: 0, februarie: 1, martie: 2, aprilie: 3, mai: 4, iunie: 5,
  iulie: 6, august: 7, septembrie: 8, octombrie: 9, noiembrie: 10, decembrie: 11,
};

/** Data publicării/reactualizării, așa cum o scrie pagina. Azi/ieri incluse. */
export function parseOlxDate(input: string | null, now: Date = new Date()): string | null {
  if (!input) return null;
  const value = decodeEntities(input).toLowerCase();
  if (value.includes("azi")) return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (value.includes("ieri")) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return yesterday.toISOString();
  }
  const match = /(\d{1,2})\s+([a-zăâîșț]+)\s+(\d{4})/.exec(value);
  if (!match) return null;
  const month = MONTHS[match[2] ?? ""];
  if (month === undefined) return null;
  return new Date(Number(match[3]), month, Number(match[1])).toISOString();
}

export function parseOlxRooms(params: string[]): number | null {
  for (const param of params) {
    const match = /(\d+)\s*camer/i.test(param) ? /(\d+)\s*camer/i.exec(param) : null;
    if (match?.[1]) return Number.parseInt(match[1], 10);
    if (/garsonier/i.test(param)) return 1;
  }
  return null;
}

export function parseOlxArea(params: string[]): number | null {
  for (const param of params) {
    const match = /(\d+(?:[.,]\d+)?)\s*m(?:²|p|2)\b/i.exec(param);
    if (match?.[1]) {
      const value = Number.parseFloat(match[1].replace(",", "."));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/* ----------------------------- card → item ------------------------------- */

export type OlxParsedFields = {
  url: string;
  sourceItemId: string | null;
  title: string;
  price: number | null;
  currency: string | null;
  area: number | null;
  rooms: number | null;
  cityText: string | null;
  neighbourhood: string | null;
  publishedAt: string | null;
  publishedText: string | null;
  imageUrls: string[];
  categoryText: string | null;
  sellerBadgeText: string | null;
  params: string[];
};

/** Câmpurile obligatorii: adresa anunțului și titlul. Fără ele, item invalid. */
export function olxFieldsFromCard(
  card: OlxRawCard,
  now?: Date,
): { fields: OlxParsedFields } | { failure: OlxParseFailure } {
  if (!card.url || !card.title) {
    return {
      failure: {
        reason: !card.url
          ? "Anunțul nu are adresă (markup-ul OLX s-a schimbat)."
          : "Anunțul nu are titlu (markup-ul OLX s-a schimbat).",
        snippet: card.html.slice(0, 160),
      },
    };
  }
  const price = parseOlxPrice(card.priceText);
  const place = parseOlxLocationDate(card.locationDateText);
  return {
    fields: {
      url: card.url,
      sourceItemId: card.sourceItemId,
      title: card.title,
      price: price.price,
      currency: price.currency,
      area: parseOlxArea(card.paramsText),
      rooms: parseOlxRooms(card.paramsText),
      cityText: place.city,
      neighbourhood: place.neighbourhood,
      publishedAt: parseOlxDate(place.publishedText, now),
      publishedText: place.publishedText,
      imageUrls: card.imageUrls,
      categoryText: card.categoryText,
      sellerBadgeText: card.sellerBadgeText,
      params: card.paramsText,
    },
  };
}
