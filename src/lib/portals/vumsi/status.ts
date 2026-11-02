/**
 * Vumsi: statusul real al anunțului (fără dependențe de server, folosit și pe card).
 *  - etichetele din `vumsiStatusInfo` (listing_statuses din `/reference/`);
 *  - cadența verificării: moderare/ciornă/necunoscut la ~30 min, publicat o dată pe zi,
 *    niciodată mai des de o dată pe minut pe anunț;
 *  - starea agregată pentru `portal_listings` (un anunț Vumsi per tranzacție).
 */

export type VumsiStatusInfo = { label: string; portalStatus: "pending" | "published" | "withdrawn" | "error"; online: boolean };

/** Statusurile Vumsi (`/reference/` listing_statuses) → eticheta din Habitoo. */
export function vumsiStatusInfo(status: number | null | undefined): VumsiStatusInfo {
  switch (status) {
    case 1: return { label: "În moderare Vumsi", portalStatus: "pending", online: false };
    case 2: return { label: "Publicat", portalStatus: "published", online: true };
    case 4: return { label: "Respins de Vumsi", portalStatus: "error", online: false };
    case 5: return { label: "Expirat", portalStatus: "withdrawn", online: false };
    case 0: return { label: "Retras", portalStatus: "withdrawn", online: false };
    case 3: return { label: "Ciornă la Vumsi", portalStatus: "pending", online: false };
    case 6: return { label: "Dezactivat de companie la Vumsi", portalStatus: "withdrawn", online: false };
    default: return { label: "Stare necunoscută", portalStatus: "pending", online: false };
  }
}

export const VUMSI_STATUS_MIN_MS = 60_000;
export const VUMSI_PENDING_CHECK_MS = 30 * 60_000;
export const VUMSI_PUBLISHED_CHECK_MS = 24 * 60 * 60_000;
export const VUMSI_REJECTED_PREFIX = "Respins de Vumsi";

export type VumsiStatusRow = {
  external_id: string;
  vumsi_uuid: string | null;
  status: number | null;
  public_url: string | null;
  expires_at: string | null;
  status_checked_at: string | null;
  deleted_at: string | null;
  reason?: string | null;
};

const age = (s: VumsiStatusRow, now: number) => (s.status_checked_at ? now - Date.parse(s.status_checked_at) : Infinity);

/** Verificarea la deschiderea tabului: cel mult o dată pe minut pe anunț. */
export function vumsiOnOpenDue(s: VumsiStatusRow, now: number): boolean {
  return !!s.vumsi_uuid && !s.deleted_at && age(s, now) >= VUMSI_STATUS_MIN_MS;
}

/** Verificarea programată: 1/3/necunoscut la 30 min, 2 o dată pe zi; restul nu. */
export function vumsiScheduledDue(s: VumsiStatusRow, now: number): boolean {
  if (!s.vumsi_uuid || s.deleted_at) return false;
  const a = age(s, now);
  if (s.status === 2) return a >= VUMSI_PUBLISHED_CHECK_MS;
  if (s.status === null || s.status === 1 || s.status === 3) return a >= VUMSI_PENDING_CHECK_MS;
  return false;
}

export type VumsiCardView = { label: string; pill: "published" | "pending" | "error" | "inactive"; reason: string | null };

/** Eticheta de pe card, din statusul Vumsi. */
export function vumsiCardView(status: number | null | undefined, reason: string | null = null): VumsiCardView {
  switch (status) {
    case 2: return { label: "Publicat", pill: "published", reason: null };
    case 1: return { label: "În moderare Vumsi", pill: "pending", reason: null };
    case 3: return { label: "Ciornă la Vumsi", pill: "pending", reason: null };
    case 4: return { label: "Respins de Vumsi", pill: "error", reason };
    case 5: return { label: "Expirat", pill: "inactive", reason: null };
    case 6: return { label: "Dezactivat", pill: "inactive", reason: null };
    case 0: return { label: "Retras", pill: "inactive", reason: null };
    default: return { label: "Stare necunoscută la Vumsi", pill: "pending", reason: null };
  }
}

/** Prioritatea la mai multe tranzacții: publicat > moderare > respins > retras. */
const RANK: Record<VumsiStatusInfo["portalStatus"], number> = { published: 0, pending: 1, error: 2, withdrawn: 3 };

export type VumsiAggregate = {
  status: number | null;
  portalStatus: VumsiStatusInfo["portalStatus"];
  publicUrl: string | null;
  expiresAt: string | null;
  reason: string | null;
};

export function aggregateVumsiStatus(rows: VumsiStatusRow[]): VumsiAggregate | null {
  const live = rows.filter((r) => r.vumsi_uuid && !r.deleted_at);
  if (!live.length) return null;
  const best = [...live].sort((a, b) => RANK[vumsiStatusInfo(a.status).portalStatus] - RANK[vumsiStatusInfo(b.status).portalStatus])[0]!;
  const online = live.filter((r) => r.status === 2);
  const exp = online.map((r) => r.expires_at).filter((x): x is string => !!x).sort()[0] ?? null;
  return {
    status: best.status,
    portalStatus: vumsiStatusInfo(best.status).portalStatus,
    publicUrl: online.find((r) => r.public_url)?.public_url ?? best.public_url ?? null,
    expiresAt: exp ?? best.expires_at ?? null,
    reason: best.status === 4 ? best.reason ?? null : null,
  };
}

/** Câmpurile `portal_listings` după verificare; `last_error` existent se păstrează, cu excepția unui refuz Vumsi vechi. */
export function vumsiListingPatch(agg: VumsiAggregate, currentError: string | null, nowIso: string) {
  const ownError = !!currentError && currentError.startsWith(VUMSI_REJECTED_PREFIX);
  const last_error =
    agg.portalStatus === "error"
      ? `${VUMSI_REJECTED_PREFIX}${agg.reason ? `: ${agg.reason}` : "."}`
      : ownError ? null : currentError;
  return {
    status: agg.portalStatus,
    last_sync_at: nowIso,
    last_error,
    ...(agg.publicUrl ? { public_url: agg.publicUrl } : {}),
  };
}

type Call = (method: "GET", path: string) => Promise<{ ok: true; data: unknown } | { ok: false; kind: string }>;
type Read = (v: unknown) => { status: number | null; url: string | null; expires_at: string | null; reason: string | null };

/** GET `/listings/{uuid}/` pentru rândurile scadente; întoarce rândurile schimbate. */
export async function checkVumsiStatuses<T extends VumsiStatusRow>(call: Call, read: Read, rows: T[], due: (r: T) => boolean, now: number): Promise<T[]> {
  const changed: T[] = [];
  for (const s of rows) {
    if (!due(s)) continue;
    const r = await call("GET", `/listings/${s.vumsi_uuid}/`);
    if (!r.ok) continue;
    const l = read(r.data);
    Object.assign(s, { status: l.status, public_url: l.url ?? s.public_url, expires_at: l.expires_at, status_checked_at: new Date(now).toISOString(), reason: l.reason });
    changed.push(s);
  }
  return changed;
}
