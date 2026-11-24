/**
 * HomeZZ: interpretarea pură a răspunsurilor `get-messages` și `get-stats`.
 * Forma `get-messages` nu e documentată: acceptăm doar structuri explicite
 * și nu ghicim câmpuri; orice altceva → `null` (lead din notificare).
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const first = (o: Obj, keys: string[]) => { for (const k of keys) { const s = str(o[k]); if (s) return s; } return null; };

export type HomezzConversationMessage = { id: string | null; body: string; sentAt: string | null; incoming: boolean };
export type HomezzConversation = {
  conversationId: string;
  name: string | null; phone: string | null; email: string | null;
  messages: HomezzConversationMessage[];
};

const CONTACT_OBJECTS = ["client", "user", "sender", "contact", "buyer"];

function contactOf(c: Obj): { name: string | null; phone: string | null; email: string | null } {
  const sources: Obj[] = [c, ...CONTACT_OBJECTS.map((k) => c[k]).filter(isObj)];
  const pick = (keys: string[]) => { for (const s of sources) { const v = first(s, keys); if (v) return v; } return null; };
  const email = pick(["email", "client_email", "user_email"]);
  return {
    name: pick(["name", "client_name", "user_name", "full_name"]),
    phone: pick(["phone", "client_phone", "user_phone", "telephone"]),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
  };
}

/** Direcție doar din câmpuri explicite; altfel mesaj de la client. */
function isOutgoing(m: Obj): boolean {
  const d = str(m["direction"])?.toLowerCase();
  if (d === "out" || d === "outgoing" || d === "sent") return true;
  for (const k of ["is_agent", "from_agent", "is_owner", "mine", "own"]) if (m[k] === true || m[k] === 1 || m[k] === "1") return true;
  const s = str(m["sender_type"] ?? m["sender"])?.toLowerCase();
  return s === "agent" || s === "agency" || s === "owner";
}

function messagesOf(c: Obj): HomezzConversationMessage[] | null {
  const list = Array.isArray(c["messages"]) ? c["messages"] : null;
  if (!list) return null;
  const out: HomezzConversationMessage[] = [];
  for (const raw of list) {
    if (!isObj(raw)) continue;
    const body = first(raw, ["message", "text", "body", "content"]);
    if (!body) continue;
    out.push({ id: first(raw, ["id", "message_id"]), body, sentAt: first(raw, ["created_at", "date", "sent_at", "created"]), incoming: !isOutgoing(raw) });
  }
  return out;
}

/** Conversația cu `conversationId` din răspunsul `get-messages`; `null` = formă neașteptată sau conversație absentă. */
export function parseHomezzConversation(data: unknown, conversationId: string): HomezzConversation | null {
  const d = isObj(data) ? data : null;
  const list: unknown[] = Array.isArray(data) ? data
    : d && Array.isArray(d["conversations"]) ? d["conversations"] as unknown[]
    : d && isObj(d["conversations"]) ? Object.entries(d["conversations"] as Obj).map(([k, v]) => (isObj(v) ? { conversation_id: k, ...v } : v))
    : d && Array.isArray(d["messages"]) ? [d]
    : [];
  for (const c of list) {
    if (!isObj(c)) continue;
    const id = first(c, ["conversation_id", "id"]);
    if (id !== conversationId) continue;
    const messages = messagesOf(c);
    if (!messages || !messages.length) return null;
    return { conversationId, ...contactOf(c), messages };
  }
  return null;
}

/** Cheia de deduplicare: ID-ul mesajului, altfel conversație + text + oră. */
export async function homezzMessageKey(conversationId: string, m: { id: string | null; body: string; sentAt: string | null }): Promise<string> {
  if (m.id) return `homezz:msg:${m.id}`;
  const hour = (m.sentAt ?? "").slice(0, 13);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([conversationId, m.body.trim(), hour]))));
  return `homezz:msg:${conversationId}:${Array.from(h.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------- statistici

export const HOMEZZ_STATS_TTL_MS = 10 * 60 * 1000;
export type HomezzStats = { messages: number; phoneViews: number; favorites: number };

export function parseHomezzStats(data: unknown): HomezzStats | null {
  const s = isObj(data) && isObj(data["stats"]) ? (data["stats"] as Obj) : null;
  if (!s) return null;
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.floor(x) : null; };
  const messages = n(s["messages"]), phoneViews = n(s["phone_views"]), favorites = n(s["added_to_favorites"]);
  return messages === null || phoneViews === null || favorites === null ? null : { messages, phoneViews, favorites };
}

export const homezzStatsDue = (checkedAt: string | null | undefined, now: Date) =>
  !checkedAt || now.getTime() - Date.parse(checkedAt) >= HOMEZZ_STATS_TTL_MS;

export function formatHomezzStats(s: HomezzStats): string {
  return `HomeZZ: ${s.messages} mesaje · ${s.phoneViews} afișări telefon · ${s.favorites} la favorite`;
}
