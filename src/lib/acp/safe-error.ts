/**
 * Stage 8: erori sigure pentru client.
 *
 * Regulă: mesajele tehnice (SQL, PostgREST, storage, stack traces) rămân în
 * logurile serverului, iar clientul primește doar texte pe care le poate
 * înțelege și acționa. Erorile create explicit cu `acpError` sunt considerate
 * sigure și pot fi afișate.
 */

/** Eroare cu mesaj explicit sigur pentru afișare în interfață. */
export class AcpSafeError extends Error {
  readonly acpSafe = true;

  constructor(message: string) {
    super(message);
    this.name = "AcpSafeError";
  }
}

/** Creează o eroare cu mesaj sigur pentru utilizator. */
export function acpError(message: string): AcpSafeError {
  return new AcpSafeError(message);
}

/** `true` dacă eroarea a fost creată intenționat cu mesaj pentru utilizator. */
export function isAcpSafeError(error: unknown): error is AcpSafeError {
  return error instanceof AcpSafeError || (error as { acpSafe?: boolean } | null)?.acpSafe === true;
}

/** Mesaj sigur pentru orice eroare: cel explicit sau unul generic. */
export function acpSafeMessage(error: unknown, fallback = "Operațiunea nu a putut fi finalizată."): string {
  return isAcpSafeError(error) ? error.message : fallback;
}

/**
 * Transformă o eroare de bază de date/storage într-una sigură, păstrând
 * detaliile tehnice doar în logurile serverului.
 */
export function acpDbError(scope: string, error: unknown, message = "Operațiunea nu a putut fi finalizată. Încearcă din nou."): AcpSafeError {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? JSON.stringify(error)
        : String(error);
  console.error(`[acp] ${scope}: ${detail}`);
  return acpError(message);
}
