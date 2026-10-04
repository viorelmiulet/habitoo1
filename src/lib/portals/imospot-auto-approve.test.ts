import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const sendEmail = vi.fn(async () => ({ ok: true }));

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    const hit = rows();
    if (patch) hit.forEach((r) => Object.assign(r, patch));
    return { data: hit, error: null, count: hit.length };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
    limit: () => q,
    update: (p: Row) => ((patch = p), q),
    insert: async (r: Row | Row[]) => {
      (tables[table] ??= []).push(...(Array.isArray(r) ? r : [r]));
      return { error: null };
    },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => query(t),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "ana@test.ro" } } }) } },
  },
}));
vi.mock("@/lib/mailgun.server", () => ({ sendEmail }));

const { retryPendingImospotRequests } = await import("./imospot-key-request.server");

const req = (extra: Row): Row => ({
  id: "r1", organization_id: "o1", portal: "imospot", requested_by: "u1",
  provider_notified_at: null, provider_notify_required: false, ...extra,
});

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["organizations"] = [{
    id: "o1", name: "Agenția", legal_name: "Test SRL", cui: "RO123", trade_registry_number: "J40/1/2020", city: "Cluj",
  }];
  tables["profiles"] = [{ id: "u1", full_name: "Ana Pop", phone: "0722123456" }];
  tables["properties"] = [];
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true });
});

describe("Imospot: trimitere automată", () => {
  it("aprobă automat o cerere pending și trimite o dată", async () => {
    tables["portal_activation_requests"] = [req({ status: "pending" })];
    await retryPendingImospotRequests("o1", "u1");
    const r = tables["portal_activation_requests"]![0]!;
    expect(r.status).toBe("approved");
    expect(r.provider_notify_required).toBe(true);
    expect(r.provider_notified_at).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("trimite pentru approved cu flag false", async () => {
    tables["portal_activation_requests"] = [req({ status: "approved" })];
    await retryPendingImospotRequests("o1", "u1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(tables["portal_activation_requests"]![0]!.provider_notify_required).toBe(true);
  });

  it("după eșec Mailgun, reîncearcă și apoi nu mai retrimite", async () => {
    tables["portal_activation_requests"] = [req({ status: "approved" })];
    sendEmail.mockResolvedValueOnce({ ok: false, error: "503" } as never);
    await retryPendingImospotRequests("o1", "u1");
    const r = tables["portal_activation_requests"]![0]!;
    expect(r.provider_notified_at).toBeNull();
    expect(String(r.provider_notify_error)).toContain("eșuat");
    await retryPendingImospotRequests("o1", "u1");
    await retryPendingImospotRequests("o1", "u1");
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(r.provider_notified_at).toBeTruthy();
  });

  it("cererea deja trimisă nu se retrimite", async () => {
    tables["portal_activation_requests"] = [req({ status: "approved", provider_notified_at: "2026-10-01T00:00:00Z" })];
    await retryPendingImospotRequests("o1", "u1");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
