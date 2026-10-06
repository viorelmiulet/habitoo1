import { describe, expect, it } from "vitest";
import { readEventShape, readMessagePayload } from "./leads.server";
import { normalizeStoriaPhone } from "./phone";
import { saveUnmatchedStoriaMessage } from "./messages.server";

/** Payload simulat exact după documentația `incoming_message`. */
const documented = {
  flow: "incoming_message",
  event_type: "incoming_message_success",
  destination: "https://crm.habitoo.ro/api/public/portal/v1/storia/notifications",
  object_id: "6073df05-2979-4372-a552-4c906a02a5cc",
  timestamp: 1524148443449,
  event_timestamp: 1531735505952,
  transaction_id: "b480075b-43de-11e8-a691-55a1dd521900",
  data: {
    ad_id: 9846457,
    conversation_id: "conv-123",
    created_at: "2026-10-06T10:00:00Z",
    from: "buyer-1",
    id: 555,
    message: "Bună ziua, mai este disponibil?",
    sender_name: "Ion Popescu",
    sender_email: "ion@example.com",
    sender_phone: 722123456,
    uuid: "a2b5c1e0-1111-4222-8333-944455556666",
  },
};

describe("forma documentată incoming_message", () => {
  it("acceptă ad_id numeric și message text simplu", () => {
    const shape = readEventShape(documented)!;
    expect(shape.adSlug).toBe("9846457");
    expect(shape.advertUuid).toBeNull();
    const m = readMessagePayload(shape);
    expect(m.body).toBe("Bună ziua, mai este disponibil?");
    expect(m.senderName).toBe("Ion Popescu");
    expect(m.email).toBe("ion@example.com");
  });

  it("folosește uuid ca id de mesaj și conversation_id pentru grupare", () => {
    const m = readMessagePayload(readEventShape(documented)!);
    expect(m.messageId).toBe("a2b5c1e0-1111-4222-8333-944455556666");
    expect(m.conversationId).toBe("conv-123");
  });

  it("refă telefonul numeric fără zero inițial", () => {
    expect(readMessagePayload(readEventShape(documented)!).phone).toBe("+40722123456");
  });

  it("acceptă message ca obiect {text} și ad_id slug", () => {
    const shape = readEventShape({
      ...documented,
      data: { ad_id: "IwcT", message: { name: "Ana", text: "Salut" } },
    })!;
    expect(shape.adSlug).toBe("IwcT");
    const m = readMessagePayload(shape);
    expect(m.body).toBe("Salut");
    expect(m.senderName).toBe("Ana");
    expect(m.messageId).toBeNull();
  });
});

describe("normalizarea telefonului", () => {
  it("aduce numerele românești la +40, fără spații", () => {
    expect(normalizeStoriaPhone("0722 123 456")).toBe("+40722123456");
    expect(normalizeStoriaPhone("+40 722-123-456")).toBe("+40722123456");
    expect(normalizeStoriaPhone("0040722123456")).toBe("+40722123456");
    expect(normalizeStoriaPhone("40722123456")).toBe("+40722123456");
    expect(normalizeStoriaPhone(722123456)).toBe("+40722123456");
    expect(normalizeStoriaPhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizeStoriaPhone("")).toBeNull();
    expect(normalizeStoriaPhone("123")).toBeNull();
    expect(normalizeStoriaPhone(null)).toBeNull();
  });
});

/** Admin simulat: înregistrează scrierile, fără bază de date reală. */
function fakeAdmin() {
  const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    let lastRow: Record<string, unknown> = {};
    Object.assign(api, {
      upsert: (row: Record<string, unknown>) => { writes.push({ table, op: "upsert", row }); lastRow = row; return api; },
      insert: (row: Record<string, unknown>) => { writes.push({ table, op: "insert", row }); lastRow = row; return api; },
      select: self,
      eq: self,
      maybeSingle: async () => ({ data: table === "portal_unmatched_messages" ? { id: "u1", ...lastRow } : null, error: null }),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: table === "user_roles" ? [{ user_id: "super-1" }, { user_id: "super-2" }] : [], error: null }),
    });
    return api;
  };
  return { admin: { from: chain } as never, writes };
}

describe("mesaj fără anunț recunoscut", () => {
  it("se păstrează doar pentru SuperAdmin, fără lead și fără agenție", async () => {
    const { admin, writes } = fakeAdmin();
    const result = await saveUnmatchedStoriaMessage(admin, {
      webhookEventId: "evt-1",
      adRef: "ZZZZ",
      externalMessageId: "msg-1",
      message: {
        senderName: "Ion",
        email: null,
        phone: "+40722123456",
        body: "Salut",
        messageId: "msg-1",
        conversationId: "conv-1",
        sentAt: null,
      },
    });
    expect(result.processed).toBe(true);
    expect(writes.some((w) => w.table === "leads" || w.table === "portal_messages")).toBe(false);
    const saved = writes.find((w) => w.table === "portal_unmatched_messages")!;
    expect(saved.row.ad_ref).toBe("ZZZZ");
    const notes = writes.filter((w) => w.table === "notifications");
    expect(notes.map((n) => n.row.user_id)).toEqual(["super-1", "super-2"]);
    expect(notes.every((n) => n.row.organization_id === null)).toBe(true);
  });
});
