export type PublicationStatus = "published" | "pending_review" | "rejected" | "removed";
export type PublicationFeedback = { portal: string; status: PublicationStatus; url: string | null; reasons: { code?: string; message: string }[]; occurred_at: string };
export const publicationLabels: Record<PublicationStatus, string> = { published: "Publicat", pending_review: "În moderare", rejected: "Respins", removed: "Scos" };
export function publicationReason(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return first && typeof first.message === "string" ? first.message : null;
}
export function mergePublicationFeedback(
  publications: { portalKey: string; status: string | null; enabled: boolean; portalName?: string; reason?: string | null; apiFeedback?: boolean }[],
  feedback: { portal: string; status: string; reasons: unknown; name: string }[],
) {
  return publications.map(pub => {
    const row = feedback.find(r => r.portal === pub.portalKey);
    return row ? { ...pub, status: row.status === "rejected" ? "error" : row.status === "removed" ? "withdrawn" : row.status === "published" ? "published" : "pending", portalName: row.name, reason: publicationReason(row.reasons), apiFeedback: true } : pub;
  });
}
export type DailyPortalStat = { portal: string; date: string; views: number; contacts: number; favorites: number };
export function summarizePortalStats(rows: DailyPortalStat[], now = new Date()) {
  const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29 + i)).toISOString().slice(0, 10));
  const portals = [...new Set(rows.filter(r => dates.includes(r.date)).map(r => r.portal))];
  return portals.map(portal => {
    const days = dates.map(date => {
      const day = rows.filter(r => r.portal === portal && r.date === date);
      return { date, views: day.reduce((n, r) => n + r.views, 0), contacts: day.reduce((n, r) => n + r.contacts, 0), favorites: day.reduce((n, r) => n + r.favorites, 0) };
    });
    return { portal, days, views: days.reduce((n, r) => n + r.views, 0), contacts: days.reduce((n, r) => n + r.contacts, 0), favorites: days.reduce((n, r) => n + r.favorites, 0) };
  });
}