/**
 * Sincronizarea stării anunțurilor Storia din `/meta` — rezervă pentru
 * notificări (documentația OLX: `/meta` recuperează informațiile pierdute).
 * Modul pur: transformă un rând `/meta` într-o notificare sintetică, procesată
 * apoi exact ca o notificare reală. Doar citiri (GET) către Storia.
 */

export const STORIA_META_PENDING_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Maximum 2 cereri pe secundă per agenție. */
export const STORIA_META_MIN_GAP_MS = 500;
export const STORIA_META_PAGE_LIMIT = 100;
export const STORIA_META_MAX_PAGES = 50;

export type StoriaMetaRecord = {
  uuid: string;
  code: string | null;
  url: string | null;
  moderationReason: string | null;
  lastError: string | null;
  /** max(last_action_at, modified_at), ms. */
  changedAtMs: number | null;
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseTime(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v < 1e12 ? v * 1000 : v;
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T"));
  return Number.isFinite(t) ? t : null;
}

function readError(v: unknown): string | null {
  if (typeof v === "string") return str(v);
  const rec = obj(v);
  return str(rec["message"]) ?? str(rec["description"]) ?? str(rec["detail"]) ?? str(rec["title"]);
}

/** Un element din `data` (`/meta` individual sau listat). */
export function parseStoriaMetaRecord(raw: unknown, fallbackUuid?: string): StoriaMetaRecord | null {
  const rec = obj(raw);
  const uuid = str(rec["uuid"]) ?? str(rec["id"]) ?? fallbackUuid ?? null;
  if (!uuid || !UUID_RE.test(uuid)) return null;
  const state = obj(rec["state"]);
  const moderation = obj(state["moderation"]);
  const times = [parseTime(rec["last_action_at"]), parseTime(rec["modified_at"])].filter(
    (t): t is number => t !== null,
  );
  return {
    uuid: uuid.toLowerCase(),
    code: str(state["code"]) ?? str(rec["code"]),
    url: str(state["url"]),
    moderationReason:
      str(moderation["reason"]) ?? str(moderation["description"]) ?? readError(moderation["reasons"]),
    lastError: readError(rec["last_error"]),
    changedAtMs: times.length ? Math.max(...times) : null,
  };
}

/** Notificare sintetică, în formatul pe care îl procesează `processLifecycle`. */
export function metaToNotification(meta: StoriaMetaRecord): Json {
  return {
    flow: "advert",
    event_type: "advert_state_sync",
    object_id: meta.uuid,
    ...(meta.changedAtMs !== null ? { event_timestamp: meta.changedAtMs } : {}),
    data: {
      uuid: meta.uuid,
      ...(meta.code ? { code: meta.code } : {}),
      ...(meta.url ? { url: meta.url } : {}),
      ...(meta.moderationReason ? { moderation: { reason: meta.moderationReason } } : {}),
    },
  };
}

/**
 * Notificările rămân sursa principală: aplicăm `/meta` doar dacă e cel puțin
 * la fel de nou ca ultimul eveniment aplicat; o stare deja aplicată (aceeași
 * stare, nimic mai nou) nu se reaplică, ca să nu repetăm notificări/republicări.
 */
export function metaSyncDecision(
  meta: StoriaMetaRecord,
  current: { status: string; lastEventAt: string | null; publicUrl: string | null },
  mappedStatus: string,
): "apply" | "skip" {
  if (!meta.code) return "skip";
  const last = current.lastEventAt ? Date.parse(current.lastEventAt) : NaN;
  if (Number.isFinite(last) && meta.changedAtMs !== null && meta.changedAtMs < last) return "skip";
  const sameState = current.status === mappedStatus && (!meta.url || meta.url === current.publicUrl);
  if (sameState && (!Number.isFinite(last) || meta.changedAtMs === null || meta.changedAtMs <= last)) {
    return "skip";
  }
  return "apply";
}

export type MetaRequest = (path: string) => Promise<{ status: number; body: Json | null }>;

/** `GET /advert/v1/meta` paginat după `links.next`, cu pauză între cereri. */
export async function fetchAllStoriaMeta(
  request: MetaRequest,
  sleep: (ms: number) => Promise<void>,
): Promise<{ records: StoriaMetaRecord[]; pages: number; complete: boolean }> {
  const records: StoriaMetaRecord[] = [];
  let path: string | null = `/advert/v1/meta?limit=${STORIA_META_PAGE_LIMIT}&page=1`;
  let pages = 0;
  while (path && pages < STORIA_META_MAX_PAGES) {
    if (pages > 0) await sleep(STORIA_META_MIN_GAP_MS);
    const res = await request(path);
    pages++;
    if (res.status < 200 || res.status >= 300 || !res.body) return { records, pages, complete: false };
    const data = res.body["data"];
    for (const item of Array.isArray(data) ? data : []) {
      const parsed = parseStoriaMetaRecord(item);
      if (parsed) records.push(parsed);
    }
    path = nextPath(obj(res.body["links"])["next"]);
  }
  return { records, pages, complete: path === null };
}

function nextPath(next: unknown): string | null {
  const s = str(next);
  if (!s) return null;
  try {
    const url = new URL(s, "https://api.olxgroup.com");
    if (url.hostname !== "api.olxgroup.com") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
