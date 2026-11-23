import { z } from "zod";

export const PHOTO_CATEGORIES = ["living", "kitchen", "bedroom", "bathroom", "balcony", "exterior", "plan", "other"] as const;
export const PHOTO_ISSUES = {
  blurry: "Fotografie neclară",
  dark: "Fotografie întunecată",
  duplicate: "Fotografie duplicată",
  person: "Persoană vizibilă",
  plate: "Număr de înmatriculare vizibil",
  document: "Document vizibil",
} as const;
export const PHOTO_CATEGORY_LABELS: Record<(typeof PHOTO_CATEGORIES)[number], string> = { living: "Living", kitchen: "Bucătărie", bedroom: "Cameră", bathroom: "Baie", balcony: "Balcon", exterior: "Exterior", plan: "Plan", other: "Altele" };
const schema = z.object({ photos: z.array(z.object({ index: z.number().int().nonnegative(), category: z.enum(PHOTO_CATEGORIES), issues: z.array(z.enum(["blurry", "dark", "duplicate", "person", "plate", "document"])).max(6), duplicate_of: z.number().int().nonnegative().nullable() }).strict()).max(20) }).strict();
export type PhotoReview = { photos: { id: string; category: (typeof PHOTO_CATEGORIES)[number]; reasons: string[] }[]; order: string[] };

export function validatePhotoReview(raw: unknown, ids: string[]): PhotoReview | null {
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data.photos.length !== ids.length || new Set(ids).size !== ids.length) return null;
  const seen = new Set<number>();
  const photos: PhotoReview["photos"] = [];
  for (const p of parsed.data.photos) {
    const id = ids[p.index];
    if (!id || seen.has(p.index) || p.duplicate_of === p.index || (p.duplicate_of !== null && !ids[p.duplicate_of])) return null;
    if (p.issues.includes("duplicate") && p.duplicate_of === null) return null;
    seen.add(p.index);
    photos.push({ id, category: p.category, reasons: [...new Set(p.issues)].map((issue) => issue === "duplicate" ? `${PHOTO_ISSUES[issue]} (poza ${Number(p.duplicate_of) + 1})` : PHOTO_ISSUES[issue]) });
  }
  photos.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { photos, order: [...photos].sort((a, b) => PHOTO_CATEGORIES.indexOf(a.category) - PHOTO_CATEGORIES.indexOf(b.category)).map((p) => p.id) };
}

/** Never drops an image; unanalysed/new images retain their relative order. */
export function confirmedPhotoOrder(current: string[], proposed: string[], confirmed: boolean): string[] {
  if (!confirmed || new Set(proposed).size !== proposed.length || proposed.some((id) => !current.includes(id))) return current;
  return [...proposed, ...current.filter((id) => !proposed.includes(id))];
}