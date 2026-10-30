/** Mesajul afișat când formularul fișei nu aparține proprietății curente. */
export const FOREIGN_FORM_MESSAGE = "Formularul aparține altei proprietăți. Reîncarcă pagina.";

/**
 * Aruncă eroare (fără nicio scriere) dacă formularul a fost încărcat pentru
 * altă proprietate decât cea din adresă sau cea încărcată acum.
 */
export function assertFormBelongsToProperty(
  formPropertyId: string | null,
  routeId: string,
  loadedPropertyId: string | null | undefined,
): void {
  if (!formPropertyId || formPropertyId !== routeId || loadedPropertyId !== routeId) {
    throw new Error(FOREIGN_FORM_MESSAGE);
  }
}

/** Scrie patch-ul doar după verificarea apartenenței formularului. */
export async function guardedPropertyWrite(
  args: { formPropertyId: string | null; routeId: string; loadedPropertyId: string | null | undefined },
  write: () => Promise<void>,
): Promise<void> {
  assertFormBelongsToProperty(args.formPropertyId, args.routeId, args.loadedPropertyId);
  await write();
}
