export const TEXT_CORRECTION_REJECTED = "Nu am putut corecta textul fără să-i schimb conținutul. Încearcă din nou.";
export const TEXT_CORRECTION_BASIC = "Am corectat doar majusculele și spațiile.";

const ACRONYMS = new Set(["PAD", "CF", "ANCPI", "AC", "LED"]);
// Unambiguous place names; unknown names are left to the AI correction prompt.
const PLACE_NAMES = new Set(["Militari", "București", "Bucuresti", "Cluj", "Napoca", "Timișoara", "Timisoara", "Iași", "Iasi", "Brașov", "Brasov", "Constanța", "Constanta", "Ilfov", "Chiajna", "Dristor", "Berceni", "Titan", "Crângași", "Crangasi", "Drumul", "Taberei", "Pipera", "Voluntari", "Otopeni"]);
const names = new Map([...PLACE_NAMES].map((name) => [name.toLocaleLowerCase("ro"), name]));
const CONTACT = /(?:https?:\/\/|www\.)[^\s<>]+|[\w.+-]+@[\w.-]+\.[\p{L}]{2,}/giu;

/** No AI, no added facts, and no paragraph/list reflow. */
export function normalizeListingText(input: string): string {
  let text = input.replace(/[şŞţŢ]/g, (c) => ({ ş: "ș", Ş: "Ș", ţ: "ț", Ţ: "Ț" })[c] ?? c).replace(/ {2,}/g, " ");
  const letters = text.match(/\p{L}/gu) ?? [];
  const capitals = letters.filter((c) => c === c.toLocaleUpperCase("ro") && c !== c.toLocaleLowerCase("ro"));
  if (!letters.length || capitals.length / letters.length <= 0.7) return text;
  const protectedValues: string[] = [];
  text = text.replace(CONTACT, (value) => {
    protectedValues.push(value);
    return `\u0000${protectedValues.length - 1}\u0000`;
  });
  text = text.replace(/\p{L}+/gu, (word) => {
    if (ACRONYMS.has(word)) return word;
    const lower = word.toLocaleLowerCase("ro");
    // Preserve already mixed-case names rather than lowercasing them.
    if (word !== word.toLocaleUpperCase("ro") && /^\p{Lu}/u.test(word)) return word;
    return names.get(lower) ?? lower;
  });
  text = text.replace(/(^|[.!?]\s+|\n[ \t]*(?:[-•*]\s*)?)(\p{L})/gu, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("ro"));
  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => protectedValues[Number(index)] ?? "");
}

function contacts(text: string): string[] {
  return (text.match(CONTACT) ?? []).map((value) => value.replace(/[.,;!?]+$/, ""));
}

export function isSafeTextCorrection(original: string, corrected: string): boolean {
  if (!original.length || !corrected.trim()) return false;
  const numbers = (value: string) => value.match(/\d+/g) ?? [];
  if (JSON.stringify(numbers(original)) !== JSON.stringify(numbers(corrected))) return false;
  if (corrected.length * 100 < original.length * 85 || corrected.length * 100 > original.length * 115) return false;
  const existing = new Set(contacts(original));
  return contacts(corrected).every((value) => existing.has(value));
}

export type TextCorrectionResult = { ok: true; text: string; basic: boolean; message?: string } | { ok: false; message: string };

export class UnsafeTextCorrectionError extends Error {
  constructor() { super(TEXT_CORRECTION_REJECTED); this.name = "UnsafeTextCorrectionError"; }
}

/** Invalid AI output is rejected, never silently presented as a correction. */
export async function correctTextWithFallback(original: string, run: (prepared: string) => Promise<string>): Promise<TextCorrectionResult> {
  const prepared = normalizeListingText(original);
  try {
    const corrected = await run(prepared);
    if (!isSafeTextCorrection(original, corrected)) return { ok: false, message: TEXT_CORRECTION_REJECTED };
    return { ok: true, text: corrected, basic: false };
  } catch (error) {
    if (error instanceof UnsafeTextCorrectionError) return { ok: false, message: TEXT_CORRECTION_REJECTED };
    if (error instanceof Error && error.name === "AiCreditsExhaustedError") return { ok: false, message: error.message };
    return { ok: true, text: isSafeTextCorrection(original, prepared) ? prepared : original, basic: true, message: TEXT_CORRECTION_BASIC };
  }
}