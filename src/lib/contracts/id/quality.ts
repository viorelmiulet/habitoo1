/**
 * Motivele de calitate ale capturii — modul pur, fără I/O.
 *
 * Interfața primește coduri stabile plus un mesaj în română, ca să poată cere o
 * fotografie mai bună în loc să afișeze o eroare generică. Niciun mesaj nu
 * conține octeți de imagine sau date din act.
 */

export const ID_QUALITY_REASONS = {
  image_unsupported_format: "Formatul imaginii nu este acceptat. Folosește JPG, PNG, WEBP, HEIC sau PDF.",
  image_too_large: "Fișierul este prea mare. Fotografiază actul din nou, cu o rezoluție mai mică.",
  image_corrupt: "Imaginea nu a putut fi deschisă. Fotografiază actul din nou.",
  image_empty: "Fișierul pare gol. Încarcă din nou fotografia actului.",
  pdf_no_pages: "PDF-ul nu are nicio pagină. Încarcă un fișier cu prima pagină a actului.",
  image_blurry: "Imaginea este prea neclară. Șterge obiectivul și fotografiază din nou, cu lumină bună.",
  mrz_not_found: "Zona citibilă automat (cele trei rânduri de pe spatele actului) nu a fost găsită.",
  mrz_lines_incomplete: "Zona citibilă automat pare tăiată. Fotografiază spatele actului în întregime.",
  mrz_unreadable: "Rândurile de pe spatele actului nu au putut fi citite corect. Fotografiază din nou, mai aproape și fără reflexii.",
  document_cropped: "Documentul pare tăiat. Încadrează întregul act în fotografie.",
  front_unreadable: "Fața actului nu a putut fi citită. Fotografiază din nou, fără reflexii.",
} as const;

export type IdQualityReason = keyof typeof ID_QUALITY_REASONS;

/** Mesajul în română pentru un cod de calitate. */
export function idQualityMessage(reason: IdQualityReason): string {
  return ID_QUALITY_REASONS[reason];
}

/** Mesajul combinat pentru o listă de motive, în ordinea primită, fără duplicate. */
export function idQualityMessages(reasons: IdQualityReason[]): string[] {
  const seen = new Set<IdQualityReason>();
  const messages: string[] = [];
  for (const reason of reasons) {
    if (seen.has(reason)) continue;
    seen.add(reason);
    messages.push(idQualityMessage(reason));
  }
  return messages;
}

/**
 * Evaluează ce lipsește din liniile candidate întoarse de model.
 * Deciziile de validitate rămân la cifrele de control; aici doar explicăm
 * capturii ce nu s-a văzut.
 */
export function assessMrzCandidates(lines: string[]): IdQualityReason[] {
  if (lines.length === 0) return ["mrz_not_found"];
  if (lines.length < 3) return ["mrz_lines_incomplete"];
  if (lines.some((line) => line.length < 30)) return ["mrz_lines_incomplete"];
  return ["mrz_unreadable"];
}
