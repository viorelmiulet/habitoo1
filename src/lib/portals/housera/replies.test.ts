import { describe, expect, it, vi } from "vitest";
import { createHouseraClient, resetHouseraRateState } from "./client.server";
import { deliverHouseraReply, drainHouseraReplies, HOUSERA_RATE_WAIT_LABEL, sendHouseraReply } from "./replies.server";
import { ingestPulledHouseraEvent } from "./events.server";
import { parseHouseraEvent } from "./events";

vi.mock("@/lib/mailgun.server", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

type Row = Record<string, unknown>;
const UNIQUE: Record<string, string[]> = {
  portal_webhook_events: ["external_event_id"],
  portal_messages: ["portal", "organization_id", "external_message_id"],
  portal_lead_links: ["portal", "organization_id", "external_lead_id"],
};

function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = { ...seed };
  let n = 0;
  const admin = {
    from(table: string) {
      const rows = (t[table] ??= []);
      const f: Array<(r: Row) => boolean> = [];
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Row = {};
      let lim = Infinity;
      const q: Record<string, unknown> = {};
      const match = () => rows.filter((r) => f.every((p) => p(r)));
      const dup = (row: Row, self?: Row) => { const k = UNIQUE[table]; return k && k.every((c) => row[c] != null) ? rows.find((r) => r !== self && k.every((c) => r[c] === row[c])) : undefined; };
      function run() {
        if (op === "insert") {
          if (dup(payload)) return { data: null, error: { code: "23505" } };
          const row = { id: payload["id"] ?? `${table}-${++n}`, ...payload }; rows.push(row); return { data: row, error: null };
        }
        if (op === "upsert") { const d = dup(payload); if (d) Object.assign(d, payload); else rows.push({ id: `${table}-${++n}`, ...payload }); return { data: null, error: null }; }
        if (op === "update") {
          const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
          for (const r of match()) { if (dup({ ...r, ...clean }, r)) return { data: null, error: { code: "23505" } }; Object.assign(r, clean); }
          return { data: null, error: null };
        }
        return { data: match().slice(0, lim), error: null };
      }
      Object.assign(q, {
        select: () => q, order: () => q, lt: () => q,
        limit: (l: number) => { lim = l; return q; },
        eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; },
        gte: (k: string, v: string) => { f.push((r) => String(r[k] ?? "") >= v); return q; },
        is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return q; },
        ilike: (k: string, v: string) => { f.push((r) => String(r[k] ?? "").toLowerCase() === v.toLowerCase()); return q; },
        not: () => q,
        contains: (k: string, s: string) => { const v = JSON.parse(s) as Row[]; f.push((r) => ((r[k] as Row[]) ?? []).some((o) => Object.entries(v[0]!).every(([a, b]) => o[a] === b))); return q; },
        insert: (p: Row) => { op = "insert"; payload = p; return q; },
        update: (p: Row) => { op = "update"; payload = p; return q; },
        upsert: (p: Row) => { op = "upsert"; payload = p; return q; },
        maybeSingle: () => { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      });
      return q;
    },
  };
  return { admin, t };
}

const seed = () => ({
  leads: [{ id: "lead-crm", organization_id: "org", name: "Ion Pop", assigned_to: "agent", property_id: null }],
  portal_lead_links: [{ id: "lk", organization_id: "org", portal: "housera", external_lead_id: "lead_1", lead_id: "lead-crm", last_message_id: null }],
});

function client(handler: (init: RequestInit) => Response) {
  resetHouseraRateState();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return handler(init!); });
  return { calls, c: createHouseraClient({ key: "k", baseUrl: "https://staging.housera.ro/api/v1/", fetch: fetchFn as unknown as typeof fetch, sleep: async () => {} }) };
}

const input = { organizationId: "org", leadId: "lead-crm", externalLeadId: "lead_1", propertyId: null, userId: "agent", body: "Bună ziua, da, este disponibil." };
const now = new Date("2026-11-06T16:00:00Z");
const outRows = (t: Record<string, Row[]>) => (t["portal_messages"] ?? []).filter((r) => r["direction"] === "out");

describe("răspuns Housera", () => {
  it("201 → trimis cu id Housera, Idempotency-Key = id-ul nostru", async () => {
    const { admin, t } = fakeDb(seed());
    const { c, calls } = client(() => Response.json({ data: { id: "m_99" } }, { status: 201 }));
    const r = await sendHouseraReply(admin, c, input, now);
    expect(r.status).toBe("sent");
    expect(r.externalId).toBe("m_99");
    expect(calls[0]!.url).toContain("leads/lead_1/messages");
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(r.id);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ body: input.body });
    expect(outRows(t)[0]!["external_message_id"]).toBe("housera:msg:m_99");
  });

  it("repetare cu aceeași cheie → 200, un singur mesaj", async () => {
    const { admin, t } = fakeDb(seed());
    let status = 422;
    const { c, calls } = client(() => (status === 422 ? Response.json({ errors: [{ code: "x", pointer: "/body" }] }, { status: 422 }) : Response.json({ data: { id: "m_7" } }, { status })));
    const first = await sendHouseraReply(admin, c, input, now);
    expect(first.status).toBe("failed");
    status = 200;
    const again = await deliverHouseraReply(admin, c, first.id, now);
    expect(again.status).toBe("sent");
    expect(again.deduplicated).toBe(true);
    const keys = calls.map((x) => (x.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
    expect(outRows(t)).toHaveLength(1);
  });

  it("429 → rămâne în așteptare și se reia din coadă", async () => {
    const { admin, t } = fakeDb(seed());
    let limited = true;
    const { c } = client(() => (limited ? new Response(JSON.stringify({ code: "too_many_requests" }), { status: 429, headers: { "Retry-After": "30" } }) : Response.json({ data: { id: "m_5" } }, { status: 201 })));
    const r = await sendHouseraReply(admin, c, input, now);
    expect(r.status).toBe("sending");
    expect(r.waiting).toBe(true);
    expect(outRows(t)[0]!["delivery_error"]).toBe(HOUSERA_RATE_WAIT_LABEL);
    expect(outRows(t)[0]!["next_attempt_at"]).toBe("2026-11-06T16:00:30.000Z");
    limited = false;
    expect(await drainHouseraReplies(admin, "org", c, new Date("2026-11-06T16:00:10Z"))).toBe(0);
    expect(await drainHouseraReplies(admin, "org", c, new Date("2026-11-06T16:00:31Z"))).toBe(1);
    expect(outRows(t)[0]!["delivery_status"]).toBe("sent");
  });

  it("422 → netrimis cu motiv pe înțeles", async () => {
    const { admin } = fakeDb(seed());
    const { c } = client(() => Response.json({ errors: [{ code: "contact_info", pointer: "/body" }] }, { status: 422 }));
    const r = await sendHouseraReply(admin, c, input, now);
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/Housera a respins mesajul/);
  });

  it("mesajul nostru revenit în evenimente nu se dublează", async () => {
    const { admin, t } = fakeDb(seed());
    const { c: sendClient } = client(() => Response.json({ data: { id: "m_42" } }, { status: 201 }));
    await sendHouseraReply(admin, sendClient, input, now);
    const { c: readClient } = client(() => Response.json({ data: [{ id: "m_42", direction: "out", body: input.body, created_at: "2026-11-06T16:00:01Z" }] }));
    const ev = parseHouseraEvent({ id: "evt_9", type: "lead.message_received", created_at: "2026-11-06T16:00:02Z", data: { lead_id: "lead_1" } })!;
    await ingestPulledHouseraEvent(admin, "org", ev, { client: readClient });
    expect(outRows(t)).toHaveLength(1);
    expect((t["portal_messages"] ?? []).filter((r) => r["external_message_id"] === "housera:msg:m_42")).toHaveLength(1);
  });
});
