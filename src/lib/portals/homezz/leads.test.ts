import { describe, expect, it } from "vitest";
import { importHomezzMessage, type HomezzLeadDeps, type HomezzMessageRow } from "./leads.server";
import { deliverHomezzReply, sendHomezzReply, HOMEZZ_UNCERTAIN, type HomezzReplyDeps, type HomezzReplyRow } from "./replies.server";
import { loadHomezzStatsLine, type HomezzStatsDeps } from "./stats.server";
import { handleHomezzCallback, type HomezzCallbackDeps } from "./callback.server";
import { sha256Hex } from "./callback";
import type { HomezzResult } from "./client";

const ok = (data: unknown, raw = ""): HomezzResult => ({ ok: true, status: 200, message: "", data, raw });
const fail = (kind: "timeout" | "action_error"): HomezzResult => ({ ok: false, kind, status: null, message: "eroare", adError: null, retryable: kind === "timeout", raw: "" });

function leadWorld(getMessages: () => Promise<HomezzResult>) {
  const rows: (HomezzMessageRow & { id: string })[] = [];
  const leads: { id: string; name: string; phone: string | null; email: string | null }[] = [];
  const links = new Map<string, string>();
  const notes: string[] = [];
  const notifications = new Set<string>();
  const logs: string[] = [];
  const deps: HomezzLeadDeps = {
    now: () => new Date("2026-11-24T20:00:00Z"),
    findOffer: async (org, id) => (org === "org1" && id === "13761" ? { propertyId: "P1", assignedTo: "U1", title: "Apartament" } : null),
    getMessages,
    logRaw: async (_o, _c, raw) => { logs.push(raw); },
    loadLink: async (_o, c) => links.get(c) ?? null,
    insertMessage: async (r) => { if (rows.some((x) => x.key === r.key)) return null; const id = `M${rows.length + 1}`; rows.push({ ...r, id }); return id; },
    createLead: async (i) => { const id = `L${leads.length + 1}`; leads.push({ id, name: i.name, phone: i.phone, email: i.email }); return id; },
    attachMessages: async (ids, leadId) => { for (const r of rows) if (ids.includes(r.id)) r.leadId = leadId; },
    saveLink: async (_o, c, l) => { links.set(c, l); },
    appendNote: async (_l, n) => { notes.push(n); },
    notify: async (n) => { notifications.add(n.key); },
  };
  return { deps, rows, leads, links, notes, notifications, logs };
}
const ev = { organizationId: "org1", internalId: "13761", conversationId: "C9", message: "Mai e disponibil?", receivedAt: "2026-11-24T19:58:00.000Z" };
const conversation = { conversations: [{ conversation_id: "C9", name: "Ion Pop", phone: "0722000000", messages: [
  { id: 1, message: "Bună ziua", created_at: "2026-11-24 19:50:00" },
  { id: 2, message: "Mai e disponibil?", created_at: "2026-11-24 19:57:00" },
] }] };

describe("HomeZZ mesaje → lead", () => {
  it("503 cu get-messages valid → un lead cu toate mesajele și datele explicite", async () => {
    const w = leadWorld(async () => ok(conversation, '{"raw":true}'));
    expect(await importHomezzMessage(w.deps, ev)).toContain("lead creat (2 mesaje");
    expect(w.leads).toEqual([{ id: "L1", name: "Ion Pop", phone: "0722000000", email: null }]);
    expect(w.rows.every((r) => r.leadId === "L1" || r.id === "M1")).toBe(true);
    expect(w.rows).toHaveLength(2);
    expect(w.links.get("C9")).toBe("L1");
    expect(w.logs).toEqual(['{"raw":true}']);
  });

  it("503 cu get-messages eșuat → lead din notificare, fără nume ghicit", async () => {
    const w = leadWorld(async () => fail("timeout"));
    expect(await importHomezzMessage(w.deps, ev)).toContain("din notificare");
    expect(w.leads).toHaveLength(1);
    expect(w.leads[0]!.name).toBe("Client HomeZZ.ro (#C9)");
    expect(w.leads[0]!.phone).toBeNull();
    expect(w.rows.map((r) => r.body)).toEqual(["Mai e disponibil?"]);
  });

  it("aceeași notificare de două ori → fără dubluri", async () => {
    const w = leadWorld(async () => ok(conversation));
    await importHomezzMessage(w.deps, ev);
    expect(await importHomezzMessage(w.deps, ev)).toBe("deja importat");
    expect(w.rows).toHaveLength(2);
    expect(w.leads).toHaveLength(1);
    const f = leadWorld(async () => fail("timeout"));
    await importHomezzMessage(f.deps, ev);
    await importHomezzMessage(f.deps, ev);
    expect(f.rows).toHaveLength(1);
  });

  it("mesaj nou pe conversație legată → notificare agentului", async () => {
    const w = leadWorld(async () => ok(conversation));
    await importHomezzMessage(w.deps, ev);
    const more = { conversations: [{ ...conversation.conversations[0]!, messages: [...conversation.conversations[0]!.messages, { id: 3, message: "Pot veni mâine?", created_at: "2026-11-24 20:10:00" }] }] };
    w.deps.getMessages = async () => ok(more);
    expect(await importHomezzMessage(w.deps, ev)).toBe("mesaje noi: 1");
    expect([...w.notifications]).toEqual(["homezz:msg:3"]);
  });

  it("internal_id necunoscut → fără lead", async () => {
    const w = leadWorld(async () => ok(conversation));
    expect(await importHomezzMessage(w.deps, { ...ev, internalId: "99991" })).toBe("anunț necunoscut în agenție");
    expect(w.leads).toHaveLength(0);
    expect(w.rows).toHaveLength(0);
  });

  it("cheia lipsește din evenimentul salvat pentru 503", async () => {
    const KEY = "AGENCY-KEY-503";
    const h = await sha256Hex(KEY);
    const saved: Record<string, unknown>[] = [];
    let imported = 0;
    const deps: HomezzCallbackDeps = {
      resolveOrg: async (x) => (x === h ? "org1" : null),
      record: async (r) => { saved.push(r.payload); return { id: "E1", duplicate: false }; },
      findListing: async () => null, markError: async () => undefined, notify: async () => undefined,
      importMessage: async () => { imported++; return "ok"; }, finish: async () => undefined,
    };
    const raw = new URLSearchParams({ "meta[code]": "503", "data[key]": KEY, "data[internal_id]": "13761", "data[conversation_id]": "C9", "data[message]": "Salut" }).toString();
    await handleHomezzCallback({ raw, contentType: "application/x-www-form-urlencoded" }, deps);
    expect(JSON.stringify(saved)).not.toContain(KEY);
    expect(imported).toBe(1);
  });
});

describe("HomeZZ răspuns agent", () => {
  function replyWorld(result: HomezzResult) {
    const rows = new Map<string, HomezzReplyRow & Record<string, unknown>>();
    let sends = 0;
    const deps: HomezzReplyDeps = {
      insert: async (r) => { rows.set(r["id"] as string, r as never); },
      load: async (id) => rows.get(id) ?? null,
      update: async (id, p) => { Object.assign(rows.get(id)!, p); },
      send: async () => { sends++; return result; },
    };
    return { deps, rows, sends: () => sends };
  }
  const input = { organizationId: "org1", leadId: "L1", conversationId: "C9", propertyId: "P1", userId: "U1", body: "Da, este disponibil." };

  it("timeout → trimis o singură dată și marcat „netrimis sigur”, fără retrimitere automată", async () => {
    const w = replyWorld(fail("timeout"));
    const r = await sendHomezzReply(w.deps, input);
    expect(w.sends()).toBe(1);
    expect(r.uncertain).toBe(true);
    expect(w.rows.get(r.id)!["delivery_status"]).toBe("failed");
    expect(w.rows.get(r.id)!["delivery_error"]).toBe(HOMEZZ_UNCERTAIN);
    expect(w.rows.get(r.id)!["conversation_id"]).toBe("homezz:C9");
  });

  it("retrimitere manuală pe același rând; un mesaj deja trimis nu pleacă din nou", async () => {
    const w = replyWorld(ok({}));
    const r = await sendHomezzReply(w.deps, input);
    expect(r.status).toBe("sent");
    await deliverHomezzReply(w.deps, r.id);
    expect(w.sends()).toBe(1);
  });
});

describe("HomeZZ statistici", () => {
  it("linia afișată și citită cel mult o dată la 10 minute", async () => {
    let calls = 0;
    let offers: unknown[] = [{ transaction: "sale", internal_id: "13761", deleted: false }];
    let now = new Date("2026-11-24T20:00:00Z");
    const deps: HomezzStatsDeps = {
      now: () => now,
      loadListing: async () => ({ id: "PL1", status: "published", portal_offers: offers }),
      saveOffers: async (_id, o) => { offers = o; },
      getStats: async () => { calls++; return ok({ stats: { messages: 3, phone_views: 7, added_to_favorites: 2 } }); },
    };
    expect(await loadHomezzStatsLine(deps, "org1", "P1")).toBe("HomeZZ: 3 mesaje · 7 afișări telefon · 2 la favorite");
    now = new Date("2026-11-24T20:09:00Z");
    await loadHomezzStatsLine(deps, "org1", "P1");
    expect(calls).toBe(1);
    now = new Date("2026-11-24T20:10:30Z");
    await loadHomezzStatsLine(deps, "org1", "P1");
    expect(calls).toBe(2);
  });

  it("eroare → fără linie", async () => {
    const deps: HomezzStatsDeps = {
      now: () => new Date(), loadListing: async () => ({ id: "PL1", status: "published", portal_offers: [{ internal_id: "13761" }] }),
      saveOffers: async () => undefined, getStats: async () => fail("action_error"),
    };
    expect(await loadHomezzStatsLine(deps, "org1", "P1")).toBeNull();
  });
});
