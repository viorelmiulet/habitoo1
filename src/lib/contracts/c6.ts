/**
 * C6 — salvarea pe fișa clientului după crearea contractului.
 * Un eșec aici nu anulează contractul: întoarce un avertisment pentru interfață,
 * ca agentul să nu creeze contractul a doua oară.
 */
export const IDENTITY_SAVE_WARNING =
  "Contractul a fost creat, dar datele actului nu au putut fi salvate pe fișa clientului. Salvează-le din fișa clientului.";

export async function saveIdentitiesAfterCreate<P extends { saveIdentity?: boolean; contactId?: string }>(
  parties: P[],
  save: (party: P & { contactId: string }) => Promise<void>,
): Promise<string | null> {
  let failed = false;
  for (const party of parties) {
    if (!party.saveIdentity || !party.contactId) continue;
    try {
      await save(party as P & { contactId: string });
    } catch (error) {
      failed = true;
      /* Doar tipul erorii, niciodată date din act. */
      console.error("contact identity save after contract failed", error instanceof Error ? error.name : "unknown");
    }
  }
  return failed ? IDENTITY_SAVE_WARNING : null;
}
