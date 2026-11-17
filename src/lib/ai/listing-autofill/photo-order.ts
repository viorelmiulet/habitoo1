/** A proposal must be a full permutation of the analyzed photos. Never repair malformed orders. */
export function validatedPhotoOrder(value: unknown, count: number): number[] | null {
  if (!Array.isArray(value) || count < 2 || value.length !== count || !value.every((v) => Number.isInteger(v) && v >= 0 && v < count) || new Set(value).size !== count) return null;
  return value as number[];
}

export function orderedPhotos<T>(all: readonly T[], analyzed: readonly T[], proposal: unknown, manualCover?: T): T[] | null {
  const order = validatedPhotoOrder(proposal, analyzed.length);
  if (!order) return null;
  const next = order.flatMap((i) => analyzed[i] === undefined ? [] : [analyzed[i] as T]);
  next.push(...all.filter((photo) => !analyzed.includes(photo)));
  if (manualCover !== undefined && next.includes(manualCover)) {
    next.splice(next.indexOf(manualCover), 1);
    next.unshift(manualCover);
  }
  return next.some((item, i) => item !== all[i]) ? next : null;
}

/** Manual gallery choices are remembered only in this browser tab; no new persisted property fields. */
const manualCovers = new Map<string, string>();
export function rememberManualCover(propertyId: string, imageId: string): void { manualCovers.set(propertyId, imageId); }
export function manualCoverFor(propertyId: string): string | undefined { return manualCovers.get(propertyId); }