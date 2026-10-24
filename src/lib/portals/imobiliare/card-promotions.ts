import { z } from "zod";
import { imobiliarePromotion } from "./promotions";

export type ImobiliarePromotionChanges = Record<string, boolean | number>;
export const imobiliarePublicationModeSchema = z.enum(["combined", "imoradar_only"]);
export type ImobiliarePublicationMode = z.infer<typeof imobiliarePublicationModeSchema>;
export function imobiliarePortalDecidesSlots(portalId: string, mode?: ImobiliarePublicationMode, changes?: ImobiliarePromotionChanges): boolean {
  return portalId === "imobiliare_ro" && (mode === "imoradar_only" || changes?.bonus === true);
}
export function imobiliareDestinationStatus(mode: ImobiliarePublicationMode | undefined, enabled = true) {
  if (!enabled) return { status: "draft", imoradar_status: "draft" };
  return { status: mode === "imoradar_only" ? "draft" : "online", ...(mode ? { imoradar_status: "online" } : {}) };
}
export const IMOBILIARE_CARD_PROMOTION_IDS = ["promo", "tl", "tls", "bonus", "pole_position", "promote_imoradar", "energy"];
export const imobiliarePromotionChangesSchema = z.record(z.union([z.boolean(), z.number().int().min(0).max(10_000)])).superRefine((changes, ctx) => {
  for (const [id, value] of Object.entries(changes)) {
    const definition = imobiliarePromotion(id);
    if (!IMOBILIARE_CARD_PROMOTION_IDS.includes(id) || !definition?.writeField || (definition.kind === "numeric" ? typeof value !== "number" : typeof value !== "boolean")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Promovare Imobiliare.ro invalidă", path: [id] });
    }
  }
});

export function imobiliarePromotionChanges(rows: { id: string; value: boolean | number | null }[], drafts: ImobiliarePromotionChanges, published: boolean): ImobiliarePromotionChanges {
  const changes: ImobiliarePromotionChanges = {};
  for (const row of rows) {
    const wanted = drafts[row.id] ?? row.value;
    if (wanted === null || wanted === undefined) continue;
    if (published ? drafts[row.id] !== undefined && wanted !== row.value : wanted === true || (typeof wanted === "number" && wanted > 0) || drafts[row.id] !== undefined) changes[row.id] = wanted;
  }
  return changes;
}

export function imobiliarePromotionControlBlocked(row: { id?: string; manageable: boolean; value: boolean | number | null; slotType: string | null; available: number | null; remaining: number | null; error: string | null; agencyRemaining?: number | null }): boolean {
  if (!row.manageable) return true;
  if (row.id === "bonus") return false;
  if (row.value === true || (typeof row.value === "number" && row.value > 0)) return false;
  return Boolean(row.slotType && (row.available === null || row.available <= 0 || row.error)) || row.remaining === 0 || row.agencyRemaining === 0;
}

/** Runs within the publication step; a promotion failure never undoes online. */
export async function runImobiliarePromotionChanges(changes: ImobiliarePromotionChanges, apply: (id: string, value: boolean | number) => Promise<{ ok: boolean; message: string }>): Promise<{ promotionId: string; message: string }[]> {
  const errors: { promotionId: string; message: string }[] = [];
  for (const [id, value] of Object.entries(changes)) {
    try {
      const result = await apply(id, value);
      if (!result.ok) errors.push({ promotionId: id, message: result.message });
    } catch (error) {
      errors.push({ promotionId: id, message: error instanceof Error ? error.message : "Promovarea nu a fost confirmată de portal." });
    }
  }
  return errors;
}