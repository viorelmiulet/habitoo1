// Reguli pure ale chatului între agenți. Baza de date le aplică identic
// (RLS + RPC-uri `chat_*`); aici sunt folosite de interfață și de teste.

export const CHAT_MAX_LENGTH = 4000;
export const CHAT_MAX_WINDOWS = 3;
export const CHAT_EMAIL_DELAY_MS = 15 * 60_000;
export const CHAT_EMAIL_COOLDOWN_MS = 60 * 60_000;

/** Perechea ordonată: aceiași doi utilizatori au mereu aceeași cheie. */
export function chatPair(a: string, b: string): [string, string] {
  if (a === b) throw new Error("Destinatar invalid");
  return a < b ? [a, b] : [b, a];
}

export function normalizeChatBody(body: string): string | null {
  const trimmed = body.replace(/\r\n/g, "\n").trim();
  if (!trimmed || trimmed.length > CHAT_MAX_LENGTH) return null;
  return trimmed;
}

export type ChatParticipant = {
  userId: string;
  lastReadAt: number;
  blockedAt: number | null;
  lastEmailAt: number | null;
};
export type ChatMessage = {
  id: string;
  senderId: string;
  createdAt: number;
  emailedAt: number | null;
};

/** Blocatul (de celălalt participant) nu mai poate trimite. */
export function canSend(senderId: string, participants: ChatParticipant[]): boolean {
  if (!participants.some((p) => p.userId === senderId)) return false;
  return !participants.some((p) => p.userId !== senderId && p.blockedAt !== null);
}

export function unreadCount(me: ChatParticipant, messages: ChatMessage[]): number {
  return messages.filter((m) => m.senderId !== me.userId && m.createdAt > me.lastReadAt).length;
}

/** Destinatarii care trebuie să primească acum un email (cel mult unul/oră/conversație). */
export function emailsDue(
  participants: ChatParticipant[],
  messages: ChatMessage[],
  now: number,
): string[] {
  return participants
    .filter((r) => r.lastEmailAt === null || now - r.lastEmailAt >= CHAT_EMAIL_COOLDOWN_MS)
    .filter((r) =>
      messages.some(
        (m) =>
          m.senderId !== r.userId &&
          m.emailedAt === null &&
          m.createdAt > r.lastReadAt &&
          now - m.createdAt >= CHAT_EMAIL_DELAY_MS,
      ),
    )
    .map((r) => r.userId);
}

export type ChatContact = {
  userId: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  online: boolean;
  unread: number;
  lastMessageAt: string | null;
};

export type ChatGroup = { organizationId: string; organizationName: string; contacts: ChatContact[] };

/** Grupuri pe agenții: agenția mea prima, apoi alfabetic; online primii, apoi activitate. */
export function groupContacts(
  contacts: ChatContact[],
  myOrgId: string | null,
  query = "",
): ChatGroup[] {
  const q = fold(query.trim());
  const map = new Map<string, ChatGroup>();
  for (const c of contacts) {
    if (q && !fold(c.fullName).includes(q) && !fold(c.organizationName).includes(q)) continue;
    const g = map.get(c.organizationId) ?? {
      organizationId: c.organizationId,
      organizationName: c.organizationName,
      contacts: [],
    };
    g.contacts.push(c);
    map.set(c.organizationId, g);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.contacts.sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        Number(b.unread > 0) - Number(a.unread > 0) ||
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") ||
        a.fullName.localeCompare(b.fullName, "ro"),
    );
  }
  return groups.sort(
    (a, b) =>
      Number(b.organizationId === myOrgId) - Number(a.organizationId === myOrgId) ||
      a.organizationName.localeCompare(b.organizationName, "ro"),
  );
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function lastSeenLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Offline";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Văzut acum câteva secunde";
  if (min < 60) return `Văzut acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Văzut acum ${h} h`;
  return `Văzut ${new Date(iso).toLocaleDateString("ro-RO")}`;
}

/** Ferestre deschise: maximum 3, cea nouă intră prima, cea mai veche iese. */
export function openWindow(list: string[], id: string): string[] {
  const next = [id, ...list.filter((x) => x !== id)];
  return next.slice(0, CHAT_MAX_WINDOWS);
}
