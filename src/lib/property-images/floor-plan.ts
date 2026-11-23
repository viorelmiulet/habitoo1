/** Reguli pure pentru marcarea „Releveu” (oglindesc triggerul din baza de date). */
export type FloorPlanImage = { id: string; is_primary: boolean; is_floor_plan?: boolean | null };

export function canMarkFloorPlan(img: FloorPlanImage): boolean {
  return !img.is_primary;
}

/**
 * Schimbările necesare pentru a marca/demarca o poză ca releveu.
 * Demarcarea vechii poze vine întâi (indexul unic permite cel mult una).
 */
export function floorPlanChanges(
  images: FloorPlanImage[],
  targetId: string,
  mark: boolean,
): { id: string; is_floor_plan: boolean }[] {
  const target = images.find((i) => i.id === targetId);
  if (!target) return [];
  if (!mark) return target.is_floor_plan ? [{ id: targetId, is_floor_plan: false }] : [];
  if (!canMarkFloorPlan(target)) throw new Error("Poza de copertă nu poate fi marcată ca releveu.");
  if (target.is_floor_plan) return [];
  return [
    ...images.filter((i) => i.id !== targetId && i.is_floor_plan).map((i) => ({ id: i.id, is_floor_plan: false })),
    { id: targetId, is_floor_plan: true },
  ];
}
