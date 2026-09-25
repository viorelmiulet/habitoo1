import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { handleMailgunEvents } from "@/lib/mailgun-events.server";
import { hasOp, makeFakeDb } from "./fake-db";

const KEY = "test-signing-key";
const NOW = 1_800_000_000;

function sign(token: string, ts = String(NOW)) {
  return {
    timestamp: ts,
    token,
    signature: createHmac("sha256", KEY).update(ts + token).digest("hex"),
  };
}

function req(body: unknown) {
  return new Request("https://x/api/public/mailgun/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function evt(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: `ev-${type}`,
    event: type,
    timestamp: NOW,
    message: { headers: { "message-id": "abc@habitoo.ro" } },
    ...extra,
  };
}

function setup(current: string | null, opts: { known?: boolean; replay?: boolean } = {}) {
  const db = makeFakeDb({
    handler: (table, ops) => {
      if (table === "email_messages" && hasOp(ops, "select"))
        return {
          data: opts.known === false ? [] : [{ id: "m1", delivery_status: current }],
          error: null,
        };
      return { data: null, error: null };
    },
    rpc: (name) =>
      name === "mail_webhook_nonce_claim"
        ? { data: !opts.replay, error: null }
        : { data: true, error: null },
  });
  return db;
}

const run = (db: ReturnType<typeof setup>, body: unknown) =>
  handleMailgunEvents(req(body), { signingKey: KEY, getDb: async () => db, nowSeconds: NOW });

const updates = (db: ReturnType<typeof setup>) =>
  db.calls.filter((c) => c.table === "email_messages" && hasOp(c.ops, "update"));
const writes = (db: ReturnType<typeof setup>) =>
  db.calls.filter((c) => hasOp(c.ops, "update") || hasOp(c.ops, "upsert") || hasOp(c.ops, "insert"));

describe("POST /api/public/mailgun/events", () => {
  it("semnătură invalidă → 401, nimic citit sau scris", async () => {
    const db = setup("accepted");
    const bad = { ...sign("t1"), signature: "0".repeat(64) };
    const res = await run(db, { signature: bad, "event-data": evt("delivered") });
    expect(res.status).toBe(401);
    expect(db.calls).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("fără corp/semnătură → 401", async () => {
    const db = setup("accepted");
    const res = await run(db, {});
    expect(res.status).toBe(401);
  });

  it("delivered → Livrat, cu ora evenimentului", async () => {
    const db = setup("accepted");
    const res = await run(db, { signature: sign("t2"), "event-data": evt("delivered") });
    expect(res.status).toBe(200);
    const [u] = updates(db);
    const patch = u!.ops.find((o) => o.method === "update")!.args[0] as Record<string, unknown>;
    expect(patch["delivery_status"]).toBe("delivered");
    expect(patch["delivered_at"]).toBe(new Date(NOW * 1000).toISOString());
  });

  it("permanent_fail după delivered → Eșuat (mai puternic), cu cod și motiv", async () => {
    const db = setup("delivered");
    await run(db, {
      signature: sign("t3"),
      "event-data": evt("failed", {
        severity: "permanent",
        reason: "bounce",
        "delivery-status": { code: 550 },
      }),
    });
    const patch = updates(db)[0]!.ops.find((o) => o.method === "update")!.args[0] as Record<
      string,
      unknown
    >;
    expect(patch["delivery_status"]).toBe("permanent_fail");
    expect(patch["status"]).toBe("failed");
    expect(patch["error_code"]).toBe("550");
    expect(patch["last_error"]).toBe("bounce");
  });

  it("delivered târziu după permanent_fail → nu suprascrie", async () => {
    const db = setup("permanent_fail");
    const res = await run(db, { signature: sign("t4"), "event-data": evt("delivered") });
    expect(res.status).toBe(200);
    expect(updates(db)).toHaveLength(0);
  });

  it("temporary_fail după delivered → nu suprascrie", async () => {
    const db = setup("delivered");
    await run(db, {
      signature: sign("t5"),
      "event-data": evt("failed", { severity: "temporary" }),
    });
    expect(updates(db)).toHaveLength(0);
  });

  it("eveniment duplicat (același token) → ignorat", async () => {
    const db = setup("accepted", { replay: true });
    const res = await run(db, { signature: sign("t6"), "event-data": evt("delivered") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ replay: true });
    expect(writes(db)).toHaveLength(0);
  });

  it("mesaj necunoscut → 200 fără modificări", async () => {
    const db = setup(null, { known: false });
    const res = await run(db, { signature: sign("t7"), "event-data": evt("delivered") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ matched: false });
    expect(writes(db)).toHaveLength(0);
  });

  it("opened/clicked → salvate ca eveniment, starea neschimbată", async () => {
    const db = setup("delivered");
    const res = await run(db, { signature: sign("t8"), "event-data": evt("opened") });
    expect(res.status).toBe(200);
    expect(updates(db)).toHaveLength(0);
  });
});
