/**
 * Stările anunțului pe Housera (fără acces la baza de date): retragere (pauză
 * sau ștergere din moderare), vândut/închiriat și reluarea la republicare.
 * Înainte de orice scriere se citește starea reală `GET account/listings/{code}`.
 */
import type { PortalOffer } from "../imobiliare/offer-links";
import { HouseraError } from "./client.server";
import type { HouseraClientLike } from "./publish";

type Data = { status?: unknown; etag?: unknown; url?: unknown };
type Body = { data?: Data } | null;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const enc = encodeURIComponent;

/** Tranzacția vândută/închiriată pentru motivul retragerii; altfel retragere normală. */
export function houseraSoldTransaction(reason: string | null | undefined): "sale" | "rent" | null {
  if (reason === "status_sold") return "sale";
  if (reason === "status_rented") return "rent";
  return null;
}

export type HouseraWithdrawAction = "sold" | "pause" | "delete" | "none";

/** Decizia pură pentru o tranzacție, după starea citită de la Housera. */
export function houseraWithdrawAction(status: string, markSold: boolean): HouseraWithdrawAction | null {
  if (markSold) {
    if (status === "active" || status === "paused") return "sold";
    if (["pending", "draft", "rejected", "unconfirmed"].includes(status)) return "delete";
    if (status === "sold") return "none";
    return null;
  }
  if (status === "active") return "pause";
  if (["pending", "draft", "rejected"].includes(status)) return "delete";
  if (["paused", "unconfirmed", "sold"].includes(status)) return "none";
  return null;
}

const DESIRED: Record<"sold" | "pause", string> = { sold: "sold", pause: "paused" };
const label = (tx: string | null) => (tx === "rent" ? "Închiriere" : tx === "sale" ? "Vânzare" : "Anunț");
const isNotFound = (e: unknown) => e instanceof HouseraError && e.status === 404;
const isRefused = (e: unknown) => e instanceof HouseraError && e.status === 409 && e.code === "listing_action_refused";

export type HouseraWithdrawResult = {
  /** Ofertele rămase, cu `status`/`etag` actualizate. */
  offers: PortalOffer[];
  /** Referințele scoase din `portal_offers` (DELETE sau anunț inexistent). */
  removed: string[];
  warnings: string[];
  writes: number;
};

async function read(client: HouseraClientLike, code: string) {
  const r = await client.requestMeta<Body>(`account/listings/${enc(code)}`);
  return { status: str(r.data?.data?.status), etag: str(r.data?.data?.etag) ?? str(r.headers.get("ETag")) };
}

export async function withdrawHousera(input: { stored: PortalOffer[]; reason?: string | null; client: HouseraClientLike }): Promise<HouseraWithdrawResult> {
  const soldTx = houseraSoldTransaction(input.reason);
  const offers: PortalOffer[] = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  let writes = 0;
  const gone = (o: PortalOffer) => { removed.push(o.reference); warnings.push(`${label(o.transaction)}: anunțul nu mai există pe Housera.`); };

  for (const offer of input.stored) {
    let cur: { status: string | null; etag: string | null };
    try { cur = await read(input.client, offer.id); } catch (e) { if (isNotFound(e)) { gone(offer); continue; } throw e; }
    const next: PortalOffer = { ...offer, ...(cur.status ? { status: cur.status } : {}), ...(cur.etag ? { etag: cur.etag } : {}) };
    const action = cur.status ? houseraWithdrawAction(cur.status, soldTx !== null && offer.transaction === soldTx) : null;
    if (!action) throw new HouseraError("refused", `${label(offer.transaction)}: starea Housera „${cur.status ?? "necunoscută"}” nu permite retragerea automată.`, null, "unknown_status");
    if (action === "none") { offers.push(next); continue; }
    try {
      writes++;
      if (action === "delete") {
        await input.client.requestMeta(`listings/${enc(offer.id)}`, { method: "DELETE" });
        removed.push(offer.reference);
        continue;
      }
      const r = await input.client.requestMeta<Body>(`listings/${enc(offer.id)}/${action}`, { method: "POST" });
      const st = str(r.data?.data?.status) ?? DESIRED[action];
      const et = str(r.data?.data?.etag) ?? str(r.headers.get("ETag"));
      offers.push({ ...next, status: st, ...(et ? { etag: et } : {}) });
    } catch (e) {
      if (isNotFound(e)) { gone(offer); continue; }
      if (isRefused(e) && action !== "delete") {
        const again = await read(input.client, offer.id).catch(() => null);
        if (again?.status === DESIRED[action]) { offers.push({ ...next, status: again.status, ...(again.etag ? { etag: again.etag } : {}) }); continue; }
        throw new HouseraError("refused", `${label(offer.transaction)}: Housera a refuzat ${action === "sold" ? "marcarea ca vândut" : "punerea pe pauză"} (stare „${again?.status ?? cur.status}”).`, 409, "listing_action_refused");
      }
      throw e;
    }
  }
  return { offers, removed, warnings, writes };
}

/** După upsert: `paused` → resume, `unconfirmed` → confirm. Întoarce oferta actualizată. */
export async function reactivateHousera(client: HouseraClientLike, offer: PortalOffer): Promise<PortalOffer> {
  const op = offer.status === "paused" ? "resume" : offer.status === "unconfirmed" ? "confirm" : null;
  if (!op) return offer;
  const r = await client.requestMeta<Body>(`listings/${enc(offer.id)}/${op}`, { method: "POST" });
  const st = str(r.data?.data?.status);
  const et = str(r.data?.data?.etag) ?? str(r.headers.get("ETag"));
  return { ...offer, ...(st ? { status: st } : {}), ...(et ? { etag: et } : {}) };
}
