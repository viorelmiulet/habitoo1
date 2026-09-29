/**
 * Indexul Properstar: logică pură (fără acces la baza de date), ca să poată fi
 * testată izolat. Partea cu baza de date este în `index-feed.server.ts`.
 *
 * Reguli:
 *  - agenție „activă pentru Properstar” = Superadminul a activat portalul
 *    (`portal_connections.activated = true`, portal `properstar`) ȘI agenția nu
 *    e blocată (nu e arhivată, suspendată — inclusiv abonament/trial expirat —,
 *    anulată sau în așteptarea aprobării); aceeași regulă ca `orgBlockReason`;
 *  - o agenție care nu mai e activă rămâne în index încă 7 zile, cu toate
 *    ofertele `Status=Deleted`, apoi dispare;
 *  - linkul fiecărei agenții e semnat HMAC-SHA256(OfficeId, PROPERSTAR_INDEX_KEY).
 */
import { buildProperstarXml, type ProperstarAdvert } from "./mapper";

export const PROPERSTAR_INDEX_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ProperstarOrgInput = {
  status: string | null;
  archived_at: string | null;
};

export type ProperstarConnectionInput = { activated: boolean | null } | null;

/** Aceeași regulă ca `orgBlockReason`: doar `active`/`trial`, nearhivată. */
export function isOrganizationOpen(org: ProperstarOrgInput): boolean {
  if (org.archived_at) return false;
  return org.status === "active" || org.status === "trial";
}

export function isProperstarActive(
  org: ProperstarOrgInput,
  connection: ProperstarConnectionInput,
): boolean {
  return connection?.activated === true && isOrganizationOpen(org);
}

export type ProperstarIndexState = {
  active: boolean;
  last_active_at: string | null;
  inactive_since: string | null;
};

/**
 * Starea următoare a agenției în index. O agenție care nu a fost niciodată
 * activă nu primește stare (nu intră deloc în index). `hints` = momentele
 * cunoscute ale dezactivării (arhivare, dezactivarea portalului); se folosesc
 * doar dacă sunt după ultima observare ca activă, altfel contează „acum”.
 */
export function nextIndexState(
  previous: ProperstarIndexState | null,
  active: boolean,
  now: Date,
  hints: (string | null | undefined)[] = [],
): ProperstarIndexState | null {
  const nowIso = now.toISOString();
  if (active) return { active: true, last_active_at: nowIso, inactive_since: null };
  if (!previous) return null;
  if (!previous.active && previous.inactive_since) return previous;
  const floor = previous.last_active_at ? new Date(previous.last_active_at).getTime() : 0;
  const candidates = hints
    .map((h) => (h ? new Date(h).getTime() : NaN))
    .filter((t) => Number.isFinite(t) && t >= floor && t <= now.getTime());
  const since = candidates.length ? new Date(Math.min(...candidates)).toISOString() : nowIso;
  return { active: false, last_active_at: previous.last_active_at, inactive_since: since };
}

export type IndexPresence = "active" | "grace" | "gone";

export function indexPresence(state: ProperstarIndexState | null, now: Date): IndexPresence {
  if (!state) return "gone";
  if (state.active) return "active";
  const since = state.inactive_since ? new Date(state.inactive_since).getTime() : NaN;
  if (!Number.isFinite(since)) return "gone";
  return now.getTime() - since <= PROPERSTAR_INDEX_GRACE_DAYS * DAY_MS ? "grace" : "gone";
}

/** În perioada de grație, toate ofertele pleacă `Deleted`, restul neschimbat. */
export function buildDeletedFeedXml(adverts: ProperstarAdvert[]): string {
  return buildProperstarXml(adverts.map((a) => ({ ...a, status: "Deleted" as const })));
}

export function signOfficeId(officeId: string, key: string): string {
  return createHmac("sha256", key).update(officeId).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyOfficeSignature(
  officeId: string,
  signature: string | null | undefined,
  key: string | null | undefined,
): boolean {
  if (!key || !signature || !officeId) return false;
  return safeEqual(signOfficeId(officeId, key), signature.trim().toLowerCase());
}

/** Compară cheia indexului în timp constant (fără scurgeri prin durată). */
export function verifyIndexKey(candidate: string, key: string | null | undefined): boolean {
  if (!key || !candidate) return false;
  const a = createHmac("sha256", "properstar-index").update(candidate).digest();
  const b = createHmac("sha256", "properstar-index").update(key).digest();
  return timingSafeEqual(a, b);
}

export function properstarAgencyFeedUrl(baseUrl: string, officeId: string, key: string): string {
  return `${baseUrl}/api/public/feed/properstar/agency/${officeId}.xml?sig=${signOfficeId(officeId, key)}`;
}

/** Escape complet pentru valori de atribute XML, în ordinea cerută. */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type ProperstarIndexEntry = {
  officeId: string;
  officeName: string;
  url: string;
  lastUpdate: string | null;
};

export function buildProperstarIndexXml(entries: ProperstarIndexEntry[]): string {
  const feeds = entries
    .map(
      (e) =>
        `\t<feed id="${escapeXmlAttribute(e.officeId)}" name="${escapeXmlAttribute(
          e.officeName,
        )}" url="${escapeXmlAttribute(e.url)}"/>\n`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>\n<Feeds>\n${feeds}</Feeds>\n`;
}
