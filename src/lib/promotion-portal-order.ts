/** Imobiliare.ro (inclusiv imoradar24) este mereu ultimul; restul își păstrează ordinea. */
export function sortPromotionPortals<T>(items: readonly T[], portalIdOf: (item: T) => string): T[] {
  const rest = items.filter((item) => portalIdOf(item) !== "imobiliare_ro");
  const last = items.filter((item) => portalIdOf(item) === "imobiliare_ro");
  return [...rest, ...last];
}
