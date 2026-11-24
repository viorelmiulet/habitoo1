/**
 * Promovările HomeZZ (pur): tipuri, interpretarea `check-promotions`,
 * `my-ads` și a promovărilor per agent din `agents`. Habitoo nu cumpără
 * nimic: folosește doar promovările existente în contractul agenției.
 */
export const HOMEZZ_PROMOTION_TYPES = [
  { id: 3, label: "Premium" },
  { id: 6, label: "Prima Pagină" },
  { id: 9, label: "Top Listă" },
  { id: 7, label: "Reînnoire instant" },
] as const;
export type HomezzPromotionId = (typeof HOMEZZ_PROMOTION_TYPES)[number]["id"];
export const HOMEZZ_PROMOTION_IDS = HOMEZZ_PROMOTION_TYPES.map((t) => t.id) as number[];
export const HOMEZZ_PROMOTION_CONFIRM = "Se consumă o promovare din pachetul HomeZZ al agenției.";
export const HOMEZZ_PROMOTION_UNKNOWN = "Nu știm dacă promovarea a fost aplicată; verifică din nou peste un minut.";
export const HOMEZZ_PROMO_TTL_MS = 60 * 1000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => { const n = typeof v === "string" && v.trim() ? Number(v) : v; return typeof n === "number" && Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

export const homezzPromotionLabel = (id: number | null) => HOMEZZ_PROMOTION_TYPES.find((t) => t.id === id)?.label ?? (id === null ? null : `Promovare ${id}`);

export type HomezzAvailable = Record<number, { remaining: number; text: string | null }>;

/** Intrări `{ id → număr | { remaining/count/total, text/name } }` sau listă `[{ promotion_id, ... }]`. */
function addEntries(out: HomezzAvailable, v: unknown) {
  const add = (idRaw: unknown, entry: unknown) => {
    const id = num(idRaw);
    if (id === null) return;
    const n = num(entry) ?? (isObj(entry) ? num(entry["remaining"]) ?? num(entry["count"]) ?? num(entry["available"]) ?? num(entry["total"]) ?? 1 : 1);
    const text = isObj(entry) ? str(entry["text"]) ?? str(entry["name"]) : null;
    const cur = out[id] ?? { remaining: 0, text: null };
    out[id] = { remaining: cur.remaining + Math.max(0, n), text: cur.text ?? text };
  };
  if (Array.isArray(v)) for (const e of v) { if (isObj(e)) add(e["promotion_id"] ?? e["id"], e); }
  else if (isObj(v)) for (const [k, e] of Object.entries(v)) add(isObj(e) && e["promotion_id"] !== undefined ? e["promotion_id"] : k, e);
}

/** Disponibile = nealocate + oprite (din nou disponibile). */
export function parseHomezzCheckPromotions(data: unknown): HomezzAvailable {
  const out: HomezzAvailable = {};
  if (!isObj(data)) return out;
  addEntries(out, data["promotions"]);
  addEntries(out, data["cancelled_promotions"]);
  return out;
}

export type HomezzActivePromotion = { promotionId: number; label: string; startDate: string | null; endDate: string | null } | null;
export type HomezzMyAd = { found: boolean; deleted: boolean; active: HomezzActivePromotion };

export function parseHomezzMyAds(data: unknown, internalId: string): HomezzMyAd {
  const candidates: unknown[] = Array.isArray(data) ? data : isObj(data) ? (Array.isArray(data["ads"]) ? data["ads"] as unknown[] : isObj(data["ad"]) ? [data["ad"]] : [data]) : [];
  const ad = candidates.find((c) => isObj(c) && (str(c["internal_id"]) === null || str(c["internal_id"]) === internalId)) as Obj | undefined;
  if (!ad) return { found: false, deleted: false, active: null };
  const deleted = ad["deleted"] === true || ad["deleted"] === 1 || ad["deleted"] === "1";
  const pid = num(ad["promotion_id"]);
  const active = pid && pid > 0 ? { promotionId: pid, label: homezzPromotionLabel(pid)!, startDate: str(ad["start_date"]), endDate: str(ad["end_date"]) } : null;
  return { found: true, deleted, active };
}

/** Butoane: active doar pentru tipurile cu cel puțin o promovare disponibilă. */
export function homezzPromotionButtons(available: HomezzAvailable) {
  return HOMEZZ_PROMOTION_TYPES.map((t) => ({ id: t.id, label: t.label, enabled: (available[t.id]?.remaining ?? 0) > 0, remaining: available[t.id]?.remaining ?? 0 }));
}

export type HomezzAgentPromotion = { id: number; label: string; total: number | null; remaining: number | null; text: string | null };
/** `promotions` din `agents`: pe tip `{ total, remaining, text }`. */
export function parseHomezzAgentPromotions(v: unknown): HomezzAgentPromotion[] {
  const rows: HomezzAgentPromotion[] = [];
  const push = (idRaw: unknown, e: unknown) => {
    const id = num(idRaw);
    if (id === null || !isObj(e)) return;
    rows.push({ id, label: homezzPromotionLabel(id)!, total: num(e["total"]), remaining: num(e["remaining"]), text: str(e["text"]) });
  };
  if (Array.isArray(v)) for (const e of v) { if (isObj(e)) push(e["promotion_id"] ?? e["id"] ?? e["type"], e); }
  else if (isObj(v)) for (const [k, e] of Object.entries(v)) push(k, e);
  return rows.sort((a, b) => HOMEZZ_PROMOTION_IDS.indexOf(a.id) - HOMEZZ_PROMOTION_IDS.indexOf(b.id));
}
