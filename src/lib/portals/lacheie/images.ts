/** Shared La Cheie image policy; never affects another portal. */
export const LACHEIE_MAX_IMAGES = 30;

export function laCheieImageWarning(count: number): string | null {
  return count > LACHEIE_MAX_IMAGES
    ? `La Cheie: se trimit primele 30 din ${count} poze.`
    : null;
}

export function orderLaCheieImages<T extends { id: string; is_primary?: boolean | null; position?: number | null }>(images: T[]): T[] {
  return [...images].sort((a, b) =>
    Number(b.is_primary === true) - Number(a.is_primary === true) ||
    (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id),
  );
}

export function remainingLaCheiePublicationError(portal: string, message: string | null): string | null {
  if (portal !== "lacheie" || !message?.includes("acceptă maximum 30")) return message;
  const remaining = message.replace(/Oferta are \d+ imagini publicabile, iar La Cheie acceptă maximum 30\.(?: Reduce numărul înainte de publicare\.)?/g, "").trim();
  const detail = remaining.replace(/^(?:La Cheie:\s*)?(?:Oferta nu poate fi trimisă la La Cheie:\s*)?/, "").trim();
  return detail ? remaining : null;
}