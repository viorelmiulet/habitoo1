/** Reguli pure pentru statisticile SuperAdmin (aceleași ca în RPC-urile `superadmin_*_stats`). */
import { computeCompleteness, completenessInputFromRow } from "@/lib/property-completeness";

export type StatsListing = { status: string; deleted_at: string | null; organization_id: string; assigned_to: string | null };
export type StatsOrg = { id: string; is_demo: boolean | null };

/** Anunțuri „active / total”, fără cele șterse. */
export function listingsRatio(rows: StatsListing[]) {
  const live = rows.filter((r) => !r.deleted_at);
  return { active: live.filter((r) => r.status === "active").length, total: live.length };
}

export function visibleOrgs<T extends StatsOrg>(orgs: T[], includeDemo: boolean): T[] {
  return includeDemo ? orgs : orgs.filter((o) => !o.is_demo);
}

export function activeByAgent(rows: StatsListing[]): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const r of rows) if (!r.deleted_at && r.status === "active") m.set(r.assigned_to, (m.get(r.assigned_to) ?? 0) + 1);
  return m;
}

/** Media gradului de completare (computeCompleteness) pe agent, pentru anunțurile active. */
export function averageCompletenessByAgent(
  props: Record<string, unknown>[],
  images: { property_id: string }[],
): Map<string | null, number> {
  const imgs = new Map<string, number>();
  for (const i of images) imgs.set(i.property_id, (imgs.get(i.property_id) ?? 0) + 1);
  const sums = new Map<string | null, { s: number; n: number }>();
  for (const p of props) {
    const id = String(p.id);
    const n = imgs.get(id) ?? 0;
    const pct = computeCompleteness(completenessInputFromRow(p, { imageCount: n, hasCover: n > 0 })).percent;
    const key = (p.assigned_to as string | null) ?? null;
    const cur = sums.get(key) ?? { s: 0, n: 0 };
    sums.set(key, { s: cur.s + pct, n: cur.n + 1 });
  }
  return new Map([...sums].map(([k, v]) => [k, Math.round(v.s / v.n)]));
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
