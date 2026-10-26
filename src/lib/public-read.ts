/** Timpul maxim pentru o citire publică; sub limita bazei pentru vizitatori neautentificați. */
export const PUBLIC_READ_TIMEOUT_MS = 2000;

/**
 * Citire din baza de date pentru o pagină publică: la eroare sau depășirea
 * timpului întoarce `fallback` și notează eroarea în log, ca pagina să se
 * afișeze fără cifrele dinamice în loc de eroarea 500.
 */
export async function publicRead<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T,
  timeoutMs = PUBLIC_READ_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout după ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([read(), timeout]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 150) : "eroare necunoscută";
    console.error(`[public-read] ${label}: ${message}`);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
