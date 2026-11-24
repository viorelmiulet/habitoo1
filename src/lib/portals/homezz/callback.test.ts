import { describe, expect, it } from "vitest";
import { handleHomezzCallback, type HomezzCallbackDeps } from "./callback.server";
import { sha256Hex } from "./callback";
import { withdrawHomezz, publishHomezz, type HomezzOffer, type HomezzPublishClient } from "./publish";
import type { HomezzResult } from "./client";

const KEY = "AGENCY-KEY-123";

async function world() {
  const keyHash = await sha256Hex(KEY);
  const events: Array<{ id: string; bodyHash: string; payload: Record<string, unknown>; processed?: boolean; note?: string }> = [];
  const listings = new Map([["L1", { id: "L1", propertyId: "P1", internalId: "13761", status: "published", lastError: null as string | null }]]);
  const notifications = new Map<string, { title: string; body: string }>();
  const deps: HomezzCallbackDeps = {
    resolveOrg: async (h) => (h === keyHash ? "org1" : null),
    record: async (r) => {
      if (events.some((e) => e.bodyHash === r.bodyHash)) return { id: null, duplicate: true };
      const id = `E${events.length + 1}`;
      events.push({ id, bodyHash: r.bodyHash, payload: r.payload });
      return { id, duplicate: false };
    },
    findListing: async (org, internalId) => {
      if (org !== "org1") return null;
      const l = [...listings.values()].find((x) => x.internalId === internalId);
      return l ? { id: l.id, propertyId: l.propertyId } : null;
    },
    markError: async (id, msg) => { const l = listings.get(id)!; l.status = "error"; l.lastError = msg; },
    notify: async (n) => { notifications.set(`${n.eventId}:${n.propertyId}`, { title: n.title, body: n.body }); },
    importMessage: async () => "mesaj importat",
    finish: async (id, r) => { const e = events.find((x) => x.id === id)!; e.processed = r.processed; e.note = r.note; },
  };
  return { deps, events, listings, notifications };
}

const body501 = { meta: { code: 501, message: "Anuntul a fost trimis spre editare" }, data: { key: KEY, internal_id: "13761", ad_error: { title: "Titlu prea scurt" }, predefined_message: "Corectati titlul." } };

describe("HomeZZ callback", () => {
  it("JSON 501 → eroare cu textul cerut și o singură notificare, fără dubluri la retrimitere", async () => {
    const w = await world();
    const raw = JSON.stringify(body501);
    const r = await handleHomezzCallback({ raw, contentType: "application/json" }, w.deps);
    expect(r.status).toBe(200);
    expect(w.listings.get("L1")!.status).toBe("error");
    expect(w.listings.get("L1")!.lastError).toBe("HomeZZ a trimis anunțul spre editare: title: Titlu prea scurt Corectati titlul.");
    const again = await handleHomezzCallback({ raw, contentType: "application/json" }, w.deps);
    expect(again.body["duplicate"]).toBe(true);
    expect(w.notifications.size).toBe(1);
    expect(w.events).toHaveLength(1);
  });

  it("form cu chei data[key] → 502 cu mesajul cerut", async () => {
    const w = await world();
    const raw = new URLSearchParams({ "meta[code]": "502", "meta[message]": "Anuntul nu a fost aprobat", "data[key]": KEY, "data[internal_id]": "13761", "data[predefined_message]": "Fotografii necorespunzatoare." }).toString();
    const r = await handleHomezzCallback({ raw, contentType: "application/x-www-form-urlencoded" }, w.deps);
    expect(r.status).toBe(200);
    expect(w.listings.get("L1")!.lastError).toBe("HomeZZ nu a aprobat anunțul: Fotografii necorespunzatoare.");
    expect(w.notifications.size).toBe(1);
  });

  it("cheie necunoscută sau lipsă → 401, nimic salvat", async () => {
    const w = await world();
    const bad = await handleHomezzCallback({ raw: JSON.stringify({ ...body501, data: { ...body501.data, key: "ALTA" } }), contentType: "application/json" }, w.deps);
    const missing = await handleHomezzCallback({ raw: JSON.stringify({ meta: body501.meta, data: { internal_id: "13761" } }), contentType: "application/json" }, w.deps);
    expect(bad.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(w.events).toHaveLength(0);
    expect(w.listings.get("L1")!.status).toBe("published");
  });

  it("cheia nu apare în evenimentul salvat", async () => {
    const w = await world();
    await handleHomezzCallback({ raw: JSON.stringify(body501), contentType: "application/json" }, w.deps);
    expect(JSON.stringify(w.events[0]!.payload)).not.toContain(KEY);
    expect((w.events[0]!.payload["data"] as Record<string, unknown>)["internal_id"]).toBe("13761");
  });

  it("503 → salvat și procesat, fără efect de moderare", async () => {
    const w = await world();
    const raw = JSON.stringify({ meta: { code: 503, message: "Anuntul a primit un mesaj nou" }, data: { key: KEY, internal_id: "13761", conversation_id: "9", message: "Buna" } });
    const r = await handleHomezzCallback({ raw, contentType: "application/json" }, w.deps);
    expect(r.body["processed"]).toBe(true);
    expect(w.events[0]!.processed).toBe(true);
    expect(w.listings.get("L1")!.status).toBe("published");
    expect(w.notifications.size).toBe(0);
  });

  it("internal_id necunoscut în agenție → salvat, fără efect", async () => {
    const w = await world();
    await handleHomezzCallback({ raw: JSON.stringify({ ...body501, data: { ...body501.data, internal_id: "99991" } }), contentType: "application/json" }, w.deps);
    expect(w.events).toHaveLength(1);
    expect(w.events[0]!.note).toBe("anunț necunoscut în agenție");
    expect(w.listings.get("L1")!.status).toBe("published");
    expect(w.notifications.size).toBe(0);
  });
});

describe("HomeZZ retragere cu agentul salvat pe ofertă", () => {
  const ok: HomezzResult = { ok: true, status: 200, message: "", data: {}, raw: "" };
  const offer = (extra: Partial<HomezzOffer> = {}): HomezzOffer => ({ transaction: "sale", reference: "13761", internal_id: "13761", id: "H1", homezz_id: "H1", url: "", ljm_url: null, agent_email: "vechi@x.ro", photos_hash: "h", deleted: false, ...extra });
  function fake() {
    const calls: string[] = [];
    const client: HomezzPublishClient = {
      agency: async (a) => { calls.push(`agency:${a}`); return ok; },
      agent: async (a, _p, email) => { calls.push(`agent:${a}:${email ?? "curent"}`); return ok; },
    };
    return { client, calls };
  }

  it("delete folosește agent_email salvat, fără move-ad, chiar dacă agentul curent nu e activat", async () => {
    const f = fake();
    const r = await withdrawHomezz({ stored: [offer()], agentEmail: null, client: f.client });
    expect(f.calls).toEqual(["agent:delete:vechi@x.ro"]);
    expect(r.offers[0]!.deleted).toBe(true);
  });

  it("reactivare: activate cu agentul salvat, apoi move-ad și update", async () => {
    const f = fake();
    await publishHomezz({ ads: [{ transaction: "sale", params: { category: 1 } }], stored: [offer({ deleted: true })], reference: "HB-1376", agentEmail: "nou@x.ro", images: { ids: [], urls: [] }, client: f.client });
    expect(f.calls).toEqual(["agent:activate:vechi@x.ro", "agency:move-ad", "agent:update:curent"]);
  });
});
