/**
 * Forma conținutului de marketing și parsarea răspunsului modelului (Stage 16).
 * Modul pur: fără rețea, fără bază de date, testabil determinist.
 *
 * Modelul răspunde cu JSON. Un răspuns care nu respectă forma așteptată este o
 * eroare explicită, nu un text prezentat utilizatorului ca rezultat valid.
 */

export type MarketingContent = {
  title: string | null;
  body: string;
  /** Variante scurte ale textului (pentru canale cu spațiu limitat). */
  shortVariants: string[];
  cta: string | null;
  hashtags: string[];
  /** Idei de headline / beneficii, doar pentru tipul de conținut „idei”. */
  ideas: string[];
};

const MAX_VARIANTS = 4;
const MAX_HASHTAGS = 10;
const MAX_IDEAS = 8;

function str(value: unknown, max = 6000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function list(value: unknown, limit: number, max = 400): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = str(item, max);
    if (text !== null && !out.includes(text)) out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** Elimină blocurile de cod din răspuns, ca JSON-ul să poată fi parsat. */
export function stripJsonFence(raw: string): string {
  const text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

export type MarketingParseResult =
  | { ok: true; content: MarketingContent }
  | { ok: false; message: string };

export function parseMarketingContent(raw: string): MarketingParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    return { ok: false, message: "Răspunsul AI nu a putut fi interpretat. Încearcă din nou." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "Răspunsul AI nu a putut fi interpretat. Încearcă din nou." };
  }
  const data = parsed as Record<string, unknown>;
  const body = str(data["body"]) ?? str(data["descriere"]);
  const ideas = list(data["ideas"] ?? data["idei"], MAX_IDEAS);
  if (body === null && ideas.length === 0) {
    return { ok: false, message: "Răspunsul AI nu a conținut text utilizabil." };
  }
  return {
    ok: true,
    content: {
      title: str(data["title"] ?? data["titlu"], 300),
      body: body ?? ideas.join("\n"),
      shortVariants: list(data["shortVariants"] ?? data["variante"], MAX_VARIANTS, 1000),
      cta: str(data["cta"], 300),
      hashtags: list(data["hashtags"], MAX_HASHTAGS, 60).map((tag) =>
        tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`,
      ),
      ideas,
    },
  };
}

/** Tot textul generat, concatenat: baza pentru validarea factuală. */
export function marketingContentText(content: MarketingContent): string {
  return [
    content.title ?? "",
    content.body,
    ...content.shortVariants,
    content.cta ?? "",
    ...content.ideas,
    ...content.hashtags,
  ]
    .filter((part) => part !== "")
    .join("\n");
}
