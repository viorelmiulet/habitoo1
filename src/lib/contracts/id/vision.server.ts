/**
 * Citirea actului cu ajutorul modelului vizual.
 *
 * Modelul nu decide niciodată dacă un câmp este valid: de pe spate întoarce
 * exclusiv cele trei rânduri brute, care intră în parserul determinist (cifrele
 * de control decid); de pe față întoarce câmpuri fără cifră de control, marcate
 * mereu „de confirmat”. Imaginea nu este salvată nicăieri și nu apare în loguri.
 */
import type { AIProvider } from "@/lib/ai/providers/types";
import { assessMrzCandidates, type IdQualityReason } from "./quality";
import { emptyReading, readMrz, type IdDocumentReading } from "./read";
import { mrzCropAttachment, type IdAttachment, type PreparedIdImage } from "./prepare.server";
import {
  extractMrzCandidates,
  mrzTextFromCandidates,
  parseFrontVision,
  type IdFrontReading,
} from "./vision.parse";

const MRZ_PROMPT = [
  "Ești un cititor de zone MRZ. În imagine este spatele unei cărți de identitate românești.",
  "Întoarce EXCLUSIV cele trei rânduri brute ale zonei citibile automat, fiecare pe o linie,",
  "exact 30 de caractere pe linie, doar A-Z, cifre și caracterul <.",
  "Nu interpreta, nu explica, nu adăuga JSON, etichete sau text suplimentar.",
  "Dacă zona MRZ nu se vede, întoarce un singur rând: NONE",
].join(" ");

const FRONT_PROMPT = [
  "În imagine este fața unei cărți de identitate românești.",
  'Întoarce un singur obiect JSON cu cheile: "address", "issuingAuthority", "issuedOn", "validUntil", "series", "surname", "givenNames", "documentNumber".',
  "Datele se scriu în format AAAA-LL-ZZ. Pentru orice câmp care nu se vede clar pune null.",
  "Nu adăuga explicații, comentarii sau text în afara obiectului JSON.",
].join(" ");

export type VisionUsage = { inputTokens: number | null; outputTokens: number | null; calls: number };

export type MrzVisionOutcome = {
  reading: IdDocumentReading | null;
  quality: IdQualityReason[];
  usage: VisionUsage;
  /** Numărul de încercări făcute (maximum 2: imaginea întreagă, apoi decupajul). */
  attempts: number;
};

function addUsage(usage: VisionUsage, input: number | null, output: number | null): VisionUsage {
  return {
    calls: usage.calls + 1,
    inputTokens: input === null ? usage.inputTokens : (usage.inputTokens ?? 0) + input,
    outputTokens: output === null ? usage.outputTokens : (usage.outputTokens ?? 0) + output,
  };
}

async function askForMrz(
  provider: AIProvider,
  attachment: IdAttachment,
): Promise<{ candidates: string[]; inputTokens: number | null; outputTokens: number | null }> {
  const result = await provider.generate({
    system: MRZ_PROMPT,
    messages: [
      {
        role: "user",
        content: "Rândurile zonei citibile automat, brute.",
        attachments: [{ mimeType: attachment.mimeType, base64: attachment.base64 }],
      },
    ],
    tools: [],
  });
  return {
    candidates: extractMrzCandidates(result.text),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

/**
 * Citește zona automată din spatele actului. La eșecul cifrelor de control se
 * reîncearcă o singură dată, cu decupajul treimii inferioare la rezoluție mai
 * mare; apoi se cere o fotografie mai bună.
 */
export async function readMrzFromImage(
  provider: AIProvider,
  prepared: Extract<PreparedIdImage, { ok: true }>,
  today = new Date(),
): Promise<MrzVisionOutcome> {
  let usage: VisionUsage = { inputTokens: null, outputTokens: null, calls: 0 };
  const attachments: IdAttachment[] = [prepared.attachment];
  const crop = mrzCropAttachment(prepared.raster);
  if (crop) attachments.push(crop);

  let quality: IdQualityReason[] = ["mrz_not_found"];
  for (let attempt = 0; attempt < attachments.length; attempt += 1) {
    const attachment = attachments[attempt] as IdAttachment;
    const answer = await askForMrz(provider, attachment);
    usage = addUsage(usage, answer.inputTokens, answer.outputTokens);
    const text = mrzTextFromCandidates(answer.candidates);
    if (!text) {
      quality = assessMrzCandidates(answer.candidates);
      continue;
    }
    const reading = readMrz(text, today);
    if (reading.ok) return { reading, quality: [], usage, attempts: attempt + 1 };
    /* Cifrele de control au căzut: păstrăm citirea, dar cerem o poză mai bună. */
    quality = ["mrz_unreadable"];
    if (attempt === attachments.length - 1) {
      return { reading, quality, usage, attempts: attempt + 1 };
    }
  }
  return { reading: null, quality, usage, attempts: attachments.length };
}

export type FrontVisionOutcome = { front: IdFrontReading; quality: IdQualityReason[]; usage: VisionUsage };

/** Citește fața actului pentru câmpurile fără cifră de control. */
export async function readFrontFromImage(
  provider: AIProvider,
  prepared: Extract<PreparedIdImage, { ok: true }>,
): Promise<FrontVisionOutcome> {
  const result = await provider.generate({
    system: FRONT_PROMPT,
    messages: [
      {
        role: "user",
        content: "Câmpurile vizibile pe fața actului, în JSON.",
        attachments: [{ mimeType: prepared.attachment.mimeType, base64: prepared.attachment.base64 }],
      },
    ],
    tools: [],
  });
  const front = parseFrontVision(result.text);
  return {
    front,
    quality: front.unreadable ? ["front_unreadable"] : [],
    usage: addUsage({ inputTokens: null, outputTokens: null, calls: 0 }, result.inputTokens, result.outputTokens),
  };
}

/** Citire goală, cu motivul numit, pentru cazurile în care nu ajungem la model. */
export function failedReading(reason: string): IdDocumentReading {
  return emptyReading(reason);
}
