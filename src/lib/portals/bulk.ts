export type BulkCellValue = { enabled: boolean; promoted: boolean };
export type BulkDraft = BulkCellValue & { propertyId: string; portalId: string };

export function bulkDraftKey(propertyId: string, portalId: string): string {
  return `${propertyId}|${portalId}`;
}

export function reconcileBulkDraft(
  drafts: Record<string, BulkDraft>,
  initial: BulkCellValue,
  next: BulkDraft,
): Record<string, BulkDraft> {
  const normalized = { ...next, promoted: next.enabled && next.promoted };
  const key = bulkDraftKey(next.propertyId, next.portalId);
  if (normalized.enabled === initial.enabled && normalized.promoted === initial.promoted) {
    const copy = { ...drafts };
    delete copy[key];
    return copy;
  }
  return { ...drafts, [key]: normalized };
}

export function toggleBulkPage(input: {
  drafts: Record<string, BulkDraft>;
  portalId: string;
  cells: { propertyId: string; enabled: boolean; promoted: boolean; eligible: boolean }[];
}): Record<string, BulkDraft> {
  const eligible = input.cells.filter((cell) => cell.eligible);
  const allEnabled = eligible.length > 0 && eligible.every((cell) =>
    input.drafts[bulkDraftKey(cell.propertyId, input.portalId)]?.enabled ?? cell.enabled,
  );
  let next = input.drafts;
  for (const cell of eligible) {
    next = reconcileBulkDraft(next, cell, {
      propertyId: cell.propertyId,
      portalId: input.portalId,
      enabled: !allEnabled,
      promoted: !allEnabled && cell.promoted,
    });
  }
  return next;
}

export function bulkSlotProjection(
  used: number,
  portalId: string,
  drafts: Record<string, BulkDraft>,
  initialByKey: Record<string, BulkCellValue>,
): number {
  return Object.values(drafts).filter((draft) => draft.portalId === portalId).reduce((total, draft) => {
    const initial = initialByKey[bulkDraftKey(draft.propertyId, draft.portalId)];
    if (!initial || initial.enabled === draft.enabled) return total;
    return total + (draft.enabled ? 1 : -1);
  }, used);
}

export function bulkLimitExceeded(used: number, limit: number | null, projected: number): boolean {
  return limit !== null && projected > limit && projected > used;
}

export function isRetryablePortalBulkError(input: { code?: string | null; httpStatus?: number | null; message?: string | null }): boolean {
  if (input.code === "RATE_LIMIT" || input.httpStatus === 429 || (input.httpStatus ?? 0) >= 500) return true;
  return /network|rețea|timeout|timed out|temporar|temporarily|\b5\d\d\b/i.test(input.message ?? "");
}

export type BulkSelectionPreview = {
  changed: number;
  skipped: number;
  before: number;
  after: number;
};

/** Previzualizarea deterministă folosită de acțiunile portal din bara de selecție. */
export function previewBulkSelection(input: {
  enabled: boolean;
  used: number;
  selected: { enabled: boolean }[];
}): BulkSelectionPreview {
  const changed = input.selected.filter((item) => item.enabled !== input.enabled).length;
  return {
    changed,
    skipped: input.selected.length - changed,
    before: input.used,
    after: Math.max(0, input.used + changed * (input.enabled ? 1 : -1)),
  };
}
