import { describe, expect, it } from "vitest";
import {
  canSend,
  chatPair,
  contactAgencyLabel,
  groupContacts,
  messengerVisible,
  PLATFORM_ORG_ID,
  type ChatContact,
  type ChatParticipant,
} from "./chat-rules";

const c = (userId: string, org: string, name: string): ChatContact => ({
  userId, fullName: userId, organizationId: org, organizationName: name,
  avatarUrl: null, lastSeenAt: null, online: false, unread: 0, lastMessageAt: null,
});
const parts = (a: string, b: string): ChatParticipant[] =>
  chatPair(a, b).map((userId) => ({ userId, lastReadAt: 0, blockedAt: null, lastEmailAt: null }));

describe("chat — superadmin", () => {
  it("superadminul apare primul, în grupul „Habitoo”, cu eticheta „Admin platformă”", () => {
    const groups = groupContacts(
      [c("ag1", "o1", "Alfa"), c("sa", PLATFORM_ORG_ID, "Habitoo"), c("ag2", "o2", "Beta")],
      "o2",
    );
    expect(groups[0]!.organizationName).toBe("Habitoo");
    expect(groups[0]!.contacts.map((x) => x.userId)).toEqual(["sa"]);
    expect(contactAgencyLabel(groups[0]!.contacts[0]!)).toBe("Admin platformă");
    expect(groups[1]!.organizationId).toBe("o2");
  });

  it("un agent îi poate scrie superadminului și invers", () => {
    const p = parts("agent", "sa");
    expect(canSend("agent", p)).toBe(true);
    expect(canSend("sa", p)).toBe(true);
  });

  it("superadminul nu poate scrie într-o conversație între doi agenți", () => {
    expect(canSend("sa", parts("ag1", "ag2"))).toBe(false);
  });

  it("messengerul e vizibil în /superadmin, dar nu în impersonare", () => {
    expect(messengerVisible({ isSuperadmin: true, hasOrganization: false, impersonating: false })).toBe(true);
    expect(messengerVisible({ isSuperadmin: true, hasOrganization: false, impersonating: true })).toBe(false);
    expect(messengerVisible({ isSuperadmin: false, hasOrganization: false, impersonating: false })).toBe(false);
  });
});
