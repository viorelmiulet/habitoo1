import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mailgun.server", () => ({ sendEmail: vi.fn(async () => undefined) }));

import { storiaAdIdToSlug, storiaAdSlugFromAdId } from "./ad-id";
import { processStoriaMessage, readEventShape } from "./leads.server";

type Row = Record<string, unknown>;

/** Bază de date în memorie: suportă doar operațiile folosite de flux. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { ...seed };
  let seq = 0;
  const rows = (t: string) => (tables[t] ??= []);
  const like = (v: unknown, pattern: string) => {
    const re = new RegExp(
      "^" + pattern.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
      "i",
    );
    return typeof v === "string" && re.test(v);
  };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row | null = null;
    let lim = Infinity;
    const run = () => {
      if (op === "insert" || op === "upsert") {
        const row: Row = { id: `${table}-${++seq}`, ...payload! };
        if (
          table === "portal_messages" &&
          row.external_message_id &&
          rows(table).some(
            (r) =>
              r.external_message_id === row.external_message_id &&
              r.organization_id === row.organization_id,
          )
        )
          return { data: null, error: { code: "23505" } };
        if (op === "upsert" && rows(table).some((r) => r.id === row.id)) return { data: null, error: null };
        rows(table).push(row);
        return { data: [row], error: null };
      }
      const hit = rows(table).filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit, error: null };
      }
      return { data: hit.slice(0, lim), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (r: Row) => ((op = "insert"), (payload = r), api),
      upsert: (r: Row) => ((op = "upsert"), (payload = r), api),
      update: (r: Row) => ((op = "update"), (payload = r), api),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
      neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), api),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
      gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), api),
      ilike: (k: string, p: string) => (filters.push((r) => like(r[k], p)), api),
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => {
          const [k, , ...rest] = p.split(".");
          return { k: k!, p: rest.join(".") };
        });
        filters.push((r) => parts.some(({ k, p }) => like(r[k], p)));
        return api;
      },
      not: (k: string, o: string, v: unknown) => {
        if (o === "is") filters.push((r) => (r[k] ?? null) !== v);
        else filters.push((r) => !String(v).slice(1, -1).split(",").includes(String(r[k])));
        return api;
      },
      order: () => api,
      limit: (n: number) => ((lim = n), api),
      maybeSingle: async () => {
        const res = run();
        return { data: res.data?.[0] ?? null, error: res.error };
      },
      single: async () => {
        const res = run();
        return { data: res.data?.[0] ?? null, error: res.error };
      },
      then: (ok: (v: unknown) => void, bad?: (e: unknown) => void) => Promise.resolve(run()).then(ok, bad),
    };
    return api;
  };
  return { admin: { from } as never, tables };
}

const PROPERTY = "11111111-1111-4111-8111-111111111111";
const ADVERT_UUID = "43744f15-9268-4cda-a46e-ffa3c2b7182e";

function seed(external = `SALE:${ADVERT_UUID}`, publicUrl: string | null = null) {
  return fakeDb({
    properties: [{ id: PROPERTY, organization_id: "org-1", assigned_to: "agent-1", title: "Apartament", deleted_at: null }],
    portal_listings: [
      { organization_id: "org-1", property_id: PROPERTY, portal: "storia", external_id: external, public_url: publicUrl },
    ],
    user_roles: [{ user_id: "super-1", role: "superadmin" }],
  });
}

/** Payload exact după documentația OLX „Receiving leads”. */
function documented(over: Record<string, unknown> = {}, root: Record<string, unknown> = {}) {
  return {
    flow: "incoming_message",
    event_type: "incoming_message_success",
    object_id: "99999999-9999-4999-8999-999999999999",
    transaction_id: "tx-1",
    ...root,
    data: {
      ad_id: 10678293,
      conversation_id: "conv-1",
      id: 208853314,
      uuid: "99999999-9999-4999-8999-999999999999",
      message: "Bună ziua, mai este disponibil?",
      sender_name: "Ion Popescu",
      sender_email: "ion@example.com",
      sender_phone: 961231212,
      created_at: "2026-10-11T15:33:45+0100",
      from: "storia",
      ...over,
    },
  };
}

const run = (admin: never, payload: unknown) =>
  processStoriaMessage(admin, readEventShape(payload)!, null);

describe("slug Storia din ad_id", () => {
  it("convertește id-ul numeric în baza 62", () => {
    expect(storiaAdIdToSlug(10678293)).toBe("INUx");
    expect(storiaAdIdToSlug(10610239)).toBe("IwcT");
    expect(storiaAdSlugFromAdId("IwcT")).toBe("IwcT");
  });
});

describe("incoming_message (documentația OLX)", () => {
  it("ad_id numeric găsește anunțul după slug", async () => {
    const { admin, tables } = seed(`SALE:${ADVERT_UUID}|ADSLUG:INUx`);
    const res = await run(admin, documented());
    expect(res.note).toMatch(/lead nou/);
    expect(tables.leads![0]!.property_id).toBe(PROPERTY);
    expect(tables.leads![0]!.assigned_to).toBe("agent-1");
  });

  it("ad_id numeric găsește anunțul și după linkul public", async () => {
    const { admin, tables } = seed(`SALE:${ADVERT_UUID}`, "https://www.storia.ro/ro/oferta/apartament-IDINUx.html");
    await run(admin, documented());
    expect(tables.leads![0]!.property_id).toBe(PROPERTY);
  });

  it("uuid găsește anunțul după external_id", async () => {
    const { admin, tables } = seed();
    await run(admin, documented({ ad_id: 1, uuid: ADVERT_UUID }, { object_id: ADVERT_UUID }));
    expect(tables.leads![0]!.property_id).toBe(PROPERTY);
  });

  it("doi cumpărători diferiți pe același anunț → două lead-uri", async () => {
    const { admin, tables } = seed(`SALE:${ADVERT_UUID}|ADSLUG:INUx`);
    await run(admin, documented());
    await run(
      admin,
      documented(
        { id: 208853315, conversation_id: "conv-2", sender_name: "Ana Pop", sender_email: "ana@example.com", sender_phone: 722000111 },
        { transaction_id: "tx-2" },
      ),
    );
    expect(tables.leads).toHaveLength(2);
    const ion = tables.leads!.find((l) => l.email === "ion@example.com")!;
    expect(ion.name).toBe("Ion Popescu");
    expect(ion.phone).not.toBe("+40722000111");
    expect(tables.portal_messages).toHaveLength(2);
  });

  it("același mesaj trimis de două ori → un singur mesaj, fără a doua notificare", async () => {
    const { admin, tables } = seed(`SALE:${ADVERT_UUID}|ADSLUG:INUx`);
    await run(admin, documented());
    const res = await run(admin, documented({ id: 208853316 }, { transaction_id: "tx-3" }));
    expect(res.note).toMatch(/duplicat/);
    expect(tables.portal_messages).toHaveLength(1);
    expect(tables.leads).toHaveLength(1);
    expect(tables.notifications).toHaveLength(1);
  });

  it("mesaj ulterior în aceeași conversație → același lead", async () => {
    const { admin, tables } = seed(`SALE:${ADVERT_UUID}|ADSLUG:INUx`);
    await run(admin, documented());
    await run(admin, documented({ id: 208853317, message: "Și parcare?" }, { transaction_id: "tx-4" }));
    expect(tables.leads).toHaveLength(1);
    expect(tables.portal_messages).toHaveLength(2);
  });

  it("ad_id necunoscut → lista SuperAdmin de mesaje nepotrivite", async () => {
    const { admin, tables } = seed();
    const res = await run(admin, documented({ ad_id: 123456 }));
    expect(res.note).toMatch(/nepotrivit/);
    expect(tables.leads ?? []).toHaveLength(0);
    expect(tables.portal_unmatched_messages![0]!.ad_ref).toBe(storiaAdIdToSlug(123456));
  });
});
