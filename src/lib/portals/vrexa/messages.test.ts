import { describe, expect, it, vi } from "vitest";
import { syncVrexaMessages, vrexaCursor, type VrexaMessage, type VrexaSyncDeps } from "./messages";
import { sendVrexaReply, vrexaReplyRetryable, type VrexaReplyDeps } from "./replies";
import type { VrexaResult } from "./client";
import type { VrexaEnv } from "./config";

const msg = (id: number, o: Partial<VrexaMessage> = {}): VrexaMessage => ({
  id, conversationId: 7, externalId: "HB-1-V", direction: "received", text: `t${id}`, sentAt: "2026-11-24T10:00:00Z",
  lead: { name: "Ana", email: "a@x.ro", phone: "0700" }, agent: null, ...o,
});
const page = (items: VrexaMessage[], next: number, hasMore: boolean): VrexaResult<{ items: VrexaMessage[]; next: number; hasMore: boolean }> => ({ ok: true, status: 200, data: { items, next, hasMore } });

function harness(env: VrexaEnv = "test", settings: Record<string, unknown> = {}) {
  const rows: { key: string; conversation: string; direction: string; body: string; id: string }[] = [];
  const pending: { id: string; conversation: string; body: string; key?: string }[] = [];
  const links = new Map<string, string>();
  const saved: Record<string, unknown>[] = [];
  const unmatched: string[] = [];
  const notes: string[] = [];
  let now = Date.parse("2026-11-24T12:00:00Z");
  const deps: VrexaSyncDeps = {
    env, organizationId: "org", settings: { ...settings }, now: () => now,
    fetchPage: vi.fn(),
    saveSettings: vi.fn(async (p) => { saved.push(p); Object.assign(deps.settings, p); }),
    findOffer: async (x) => (x === "HB-1-V" ? { propertyId: "p1", assignedTo: "u1", title: "Ap" } : null),
    insertMessage: async (r) => { if (rows.some((x) => x.key === r.key)) return null; const id = `r${rows.length}`; rows.push({ ...r, id }); return id; },
    findPendingReply: async (c, t) => pending.find((p) => p.conversation === c && p.body === t && !p.key)?.id ?? null,
    confirmReply: async (id, key) => { pending.find((p) => p.id === id)!.key = key; },
    loadLink: async (c) => links.get(c) ?? null,
    createLead: vi.fn(async () => "lead1"),
    saveLink: async (c, l) => { links.set(c, l); },
    appendNote: async (_l, n) => { notes.push(n); },
    notify: vi.fn(async () => undefined),
    unmatched: async (_m, key) => { unmatched.push(key); },
  };
  return { deps, rows, pending, links, saved, unmatched, notes, setNow: (n: number) => { now = n; } };
}

describe("Vrexa — preluarea mesajelor", () => {
  it("paginare cu hasMore, cursorul avansează după fiecare pagină salvată", async () => {
    const h = harness();
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(page([msg(1)], 1, true)).mockResolvedValueOnce(page([msg(2)], 2, false));
    const r = await syncVrexaMessages(h.deps);
    expect(h.deps.fetchPage).toHaveBeenNthCalledWith(1, "0");
    expect(h.deps.fetchPage).toHaveBeenNthCalledWith(2, "1");
    expect(r.pages).toBe(2);
    expect(vrexaCursor(h.deps.settings, "test")).toBe("2");
    expect(h.deps.createLead).toHaveBeenCalledTimes(1);
    expect(h.deps.notify).toHaveBeenCalledTimes(1);
  });

  it("cel mult 5 pagini pe rulare", async () => {
    const h = harness();
    let n = 0;
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockImplementation(async () => { n++; return page([msg(n)], n, true); });
    expect((await syncVrexaMessages(h.deps)).pages).toBe(5);
  });

  it("cursorul nu avansează dacă salvarea paginii eșuează", async () => {
    const h = harness();
    h.deps.insertMessage = async () => { throw new Error("db"); };
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(page([msg(1)], 1, false));
    await expect(syncVrexaMessages(h.deps)).rejects.toThrow("db");
    expect(vrexaCursor(h.deps.settings, "test")).toBe("0");
    expect(h.saved).toEqual([]);
  });

  it("același mesaj de două ori → un singur rând", async () => {
    const h = harness();
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue(page([msg(1), msg(1)], 1, false));
    await syncVrexaMessages(h.deps);
    await syncVrexaMessages(h.deps);
    expect(h.rows).toHaveLength(1);
    expect(h.deps.createLead).toHaveBeenCalledTimes(1);
  });

  it("messages_disabled → stare pe conexiune și o reîncercare pe oră", async () => {
    const h = harness();
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403, kind: "http", message: "x", problem: { code: "messages_disabled", detail: null, errors: null } });
    expect((await syncVrexaMessages(h.deps)).disabled).toBe(true);
    expect(typeof h.deps.settings["vrexa_messages_disabled_at"]).toBe("string");
    h.setNow(Date.parse("2026-11-24T12:30:00Z"));
    expect((await syncVrexaMessages(h.deps)).skipped).toBe("disabled_wait");
    expect(h.deps.fetchPage).toHaveBeenCalledTimes(1);
    h.setNow(Date.parse("2026-11-24T13:01:00Z"));
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue(page([], 0, false));
    await syncVrexaMessages(h.deps);
    expect(h.deps.fetchPage).toHaveBeenCalledTimes(2);
    expect(h.deps.settings["vrexa_messages_disabled_at"]).toBeNull();
  });

  it("externalId necunoscut → mesaj nepotrivit, fără lead", async () => {
    const h = harness();
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue(page([msg(1, { externalId: "ALT" })], 1, false));
    await syncVrexaMessages(h.deps);
    expect(h.unmatched).toEqual(["test:1"]);
    expect(h.rows).toHaveLength(0);
    expect(h.deps.createLead).not.toHaveBeenCalled();
  });

  it("mesaj scris direct pe site → adăugat ca ieșire, o singură dată", async () => {
    const h = harness();
    h.links.set("7", "lead1");
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue(page([msg(3, { direction: "sent", text: "Bună", agent: { name: "Ion", email: null } })], 3, false));
    await syncVrexaMessages(h.deps);
    await syncVrexaMessages(h.deps);
    expect(h.rows).toEqual([expect.objectContaining({ direction: "out", body: "Bună", key: "test:3" })]);
  });

  it("medii separate: cursor, chei și conversații distincte", async () => {
    const h = harness("production", { vrexa_messages_cursor: { test: "40" } });
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue(page([msg(1)], 1, false));
    await syncVrexaMessages(h.deps);
    expect(h.deps.fetchPage).toHaveBeenCalledWith("0");
    expect(h.deps.settings["vrexa_messages_cursor"]).toEqual({ test: "40", production: "1" });
    expect(h.rows[0]).toMatchObject({ key: "production:1", conversation: "vrexa:production:7" });
  });
});

describe("Vrexa — răspunsul agentului", () => {
  function replyDeps(send: VrexaReplyDeps["send"]) {
    const store = new Map<string, Record<string, unknown>>();
    const deps: VrexaReplyDeps = {
      insert: async (r) => { store.set(r["id"] as string, { ...r }); },
      load: async (id) => (store.get(id) as never) ?? null,
      update: async (id, p) => { Object.assign(store.get(id)!, p); },
      send: vi.fn(send),
    };
    return { deps, store };
  }
  const input = { organizationId: "org", leadId: "l", conversationId: "7", propertyId: "p1", userId: "u1", body: "Salut", id: "m1" };

  it("trimis o singură dată și confirmat la preluare", async () => {
    const { deps, store } = replyDeps(async () => ({ ok: false, status: null, kind: "network", message: "x", problem: { code: null, detail: null, errors: null } }));
    const r = await sendVrexaReply(deps, "test", input, new Date("2026-11-24T12:00:00Z"));
    expect(r.status).toBe("awaiting");
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(vrexaReplyRetryable(store.get("m1") as never, Date.parse("2026-11-24T12:10:00Z"))).toBe(false);
    expect(vrexaReplyRetryable(store.get("m1") as never, Date.parse("2026-11-24T12:16:00Z"))).toBe(true);

    const h = harness();
    h.pending.push({ id: "m1", conversation: "vrexa:test:7", body: "Salut" });
    (h.deps.fetchPage as ReturnType<typeof vi.fn>).mockResolvedValue(page([msg(9, { direction: "sent", text: "Salut" })], 9, false));
    await syncVrexaMessages(h.deps);
    expect(h.pending[0]!.key).toBe("test:9");
    expect(h.rows).toHaveLength(0);
  });

  it("succes: salvează ID-ul Vrexa; daily_reply_limit_reached → mesaj și ora de reluare", async () => {
    const ok = replyDeps(async () => ({ ok: true, status: 201, data: { id: 55 } }));
    await sendVrexaReply(ok.deps, "test", input);
    expect(ok.store.get("m1")).toMatchObject({ delivery_status: "sent", external_message_id: "test:55", conversation_id: "vrexa:test:7" });
    const lim = replyDeps(async () => ({ ok: false, status: 429, kind: "rate_limited", message: "x", retryAt: "2026-11-25T00:00:00Z", problem: { code: "daily_reply_limit_reached", detail: null, errors: null } }));
    const r = await sendVrexaReply(lim.deps, "test", input);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("limita zilnică");
    expect(r.error).toContain("Se poate relua după");
  });
});
