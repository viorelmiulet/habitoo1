export type ImobiliareMedia = { id: string | number; order: number };

/** Only the documented media collection counts as confirmed photographs. */
export function imobiliareMediaImages(body: unknown): ImobiliareMedia[] | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const images: ImobiliareMedia[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (row.collection !== "images") continue;
    if ((typeof row.id !== "number" && typeof row.id !== "string") || typeof row.order !== "number") return null;
    images.push({ id: row.id, order: row.order });
  }
  return images.sort((a, b) => a.order - b.order);
}