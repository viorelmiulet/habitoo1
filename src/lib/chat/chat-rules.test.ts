import { describe, expect, it } from "vitest";
import {
  canSend,
  chatPair,
  emailsDue,
  groupContacts,
  normalizeChatBody,
  openWindow,
  unreadCount,
  type ChatContact,
  type ChatMessage,
  type ChatParticipant,
} from "./chat-rules";

/** Depozit simulat care respectă aceleași reguli ca RLS-ul din bază. */
function fakeStore() {
  const convs = new Map<string, { id: string; parts: ChatParticipant[]; msgs: ChatMessage[] }>();
  let n = 0;
  return {
    open(me: string, other: string) {
      const key = chatPair(me, other).join(":");
      if (!convs.has(key)) {
        convs.set(key, {
          id: `c${++n}`,
          parts: chatPair(me, other).map((userId) => ({
            userId,
            lastReadAt: 0,
            blockedAt: null,
            lastEmailAt: null,
          })),
          msgs: [],
        });
      }
      return convs.get(key)!;
    },
    visibleTo(user: string) {
      return [...convs.values()].filter((c) => c.parts.some((p) => p.userId === user));
    },
    count: () => convs.size,
  };
}

const msg = (id: string, senderId: string, createdAt: number): ChatMessage => ({
  id,
  senderId,
  createdAt,
  emailedAt: null,
});

describe("chat între agenți", () => {
  it("o singură conversație între aceiași doi utilizatori", () => {
    const s = fakeStore();
    const a = s.open("u1", "u2");
    const b = s.open("u2", "u1");
    expect(a.id).toBe(b.id);
    expect(s.count()).toBe(1);
  });

  it("un al treilea utilizator nu vede nimic", () => {
    const s = fakeStore();
    s.open("u1", "u2").msgs.push(msg("m1", "u1", 1));
    expect(s.visibleTo("u3")).toHaveLength(0);
    expect(s.visibleTo("u2")).toHaveLength(1);
    expect(canSend("u3", s.open("u1", "u2").parts)).toBe(false);
  });

  it("contor de necitite", () => {
    const me: ChatParticipant = { userId: "u2", lastReadAt: 10, blockedAt: null, lastEmailAt: null };
    const msgs = [msg("a", "u1", 5), msg("b", "u1", 11), msg("c", "u1", 12), msg("d", "u2", 13)];
    expect(unreadCount(me, msgs)).toBe(2);
  });

  it("un singur email după 15 minute, apoi maximum unul pe oră", () => {
    const parts: ChatParticipant[] = [
      { userId: "u1", lastReadAt: 0, blockedAt: null, lastEmailAt: null },
      { userId: "u2", lastReadAt: 0, blockedAt: null, lastEmailAt: null },
    ];
    const t0 = 1_000_000;
    const msgs = [msg("a", "u1", t0), msg("b", "u1", t0 + 1000)];
    expect(emailsDue(parts, msgs, t0 + 14 * 60_000)).toEqual([]);
    const now = t0 + 15 * 60_000 + 1000;
    expect(emailsDue(parts, msgs, now)).toEqual(["u2"]);
    // după trimitere: mesajele marcate și cooldown activ
    msgs.forEach((m) => (m.emailedAt = now));
    parts[1]!.lastEmailAt = now;
    msgs.push(msg("c", "u1", now + 1000));
    expect(emailsDue(parts, msgs, now + 30 * 60_000)).toEqual([]);
    expect(emailsDue(parts, msgs, now + 61 * 60_000)).toEqual(["u2"]);
  });

  it("nu trimite email dacă mesajul a fost citit", () => {
    const parts: ChatParticipant[] = [
      { userId: "u2", lastReadAt: 500, blockedAt: null, lastEmailAt: null },
    ];
    expect(emailsDue(parts, [msg("a", "u1", 100)], 100 + 20 * 60_000)).toEqual([]);
  });

  it("blocare: utilizatorul blocat nu mai poate trimite", () => {
    const parts: ChatParticipant[] = [
      { userId: "u1", lastReadAt: 0, blockedAt: 5, lastEmailAt: null },
      { userId: "u2", lastReadAt: 0, blockedAt: null, lastEmailAt: null },
    ];
    expect(canSend("u2", parts)).toBe(false);
    parts[0]!.blockedAt = null;
    expect(canSend("u2", parts)).toBe(true);
  });

  it("lista grupată pe agenții, agenția mea prima, online primii", () => {
    const c = (userId: string, org: string, online: boolean): ChatContact => ({
      userId,
      fullName: userId,
      organizationId: org,
      organizationName: org === "o1" ? "Zeta" : "Alfa",
      avatarUrl: null,
      lastSeenAt: null,
      online,
      unread: 0,
      lastMessageAt: null,
    });
    const groups = groupContacts([c("Ana", "o2", false), c("Bob", "o2", true), c("Cip", "o1", false)], "o1");
    expect(groups.map((g) => g.organizationId)).toEqual(["o1", "o2"]);
    expect(groups[1]!.contacts.map((x) => x.userId)).toEqual(["Bob", "Ana"]);
  });

  it("text simplu, maximum 4000 de caractere și cel mult 3 ferestre", () => {
    expect(normalizeChatBody("   ")).toBeNull();
    expect(normalizeChatBody("a".repeat(4001))).toBeNull();
    expect(normalizeChatBody(" salut ")).toBe("salut");
    expect(openWindow(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
  });
});
