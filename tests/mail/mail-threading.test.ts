// Mail Center — phase 8: outbound threading + delivery state transitions.
import { describe, expect, test } from "vitest";
import { makeFakeDb, type FakeOp } from "./fake-db";
import { findThreadByReferences, resolveThread } from "../../src/lib/mail-threading.server";
import {
  deliveryStatusForEvent,
  messageStatusForDelivery,
  shouldApplyDelivery,
} from "../../src/lib/mailgun";

type Db = Parameters<typeof resolveThread>[0];

/** Fake db whose email_messages lookup answers with the given rows. */
function db(rows: unknown[], rpcResult: { data?: unknown; error?: unknown } = { data: "thread-1" }) {
  const calls: { table: string; ops: FakeOp[] }[] = [];
  const fake = makeFakeDb({
    handler: (table, ops) => {
      calls.push({ table, ops });
      return table === "email_messages" ? { data: rows } : { data: null };
    },
    rpc: () => rpcResult,
  });
  return fake as unknown as Db & typeof fake;
}

describe("outbound threading", () => {
  test("a new compose resolves a thread before the message is persisted", async () => {
    const fake = db([]);
    const threadId = await resolveThread(fake, {
      mailboxId: "mb-1",
      subject: "ClickImob Mail Center — Test 1",
      counterpart: "someone@example.com",
      participants: ["contact@clickimob.ro", "someone@example.com"],
    });
    expect(threadId).toBe("thread-1");
    expect(fake.rpcCalls[0]?.name).toBe("email_thread_upsert");
  });

  test("the derived key is deterministic — same conversation, same key", async () => {
    const a = db([]);
    const b = db([]);
    const input = {
      mailboxId: "mb-1",
      subject: "Re: ClickImob Mail Center — Test 1",
      counterpart: "someone@example.com",
      participants: [],
    };
    await resolveThread(a, input);
    await resolveThread(b, { ...input, subject: "ClickImob Mail Center — Test 1" });
    const keyA = (a.rpcCalls[0]?.args as { _subject_key: string })._subject_key;
    const keyB = (b.rpcCalls[0]?.args as { _subject_key: string })._subject_key;
    expect(keyA).toBe(keyB);
  });

  test("two concurrent sends converge on ONE thread via the upsert", async () => {
    const fake = db([]);
    const [t1, t2] = await Promise.all([
      resolveThread(fake, { mailboxId: "mb-1", subject: "S", counterpart: "x@y.z", participants: [] }),
      resolveThread(fake, { mailboxId: "mb-1", subject: "S", counterpart: "x@y.z", participants: [] }),
    ]);
    expect(t1).toBe(t2);
    expect(new Set(fake.rpcCalls.map((c) => JSON.stringify(c.args))).size).toBe(1);
  });

  test("a failed upsert never invents a thread id", async () => {
    const fake = db([], { data: null, error: { code: "XX000" } });
    expect(
      await resolveThread(fake, { mailboxId: "mb-1", subject: "S", counterpart: "a@b.c", participants: [] }),
    ).toBeNull();
  });
});

describe("inbound reply linking", () => {
  test("In-Reply-To pointing at our outbound reuses its thread", async () => {
    const fake = db([{ thread_id: "thread-1", provider_message_id: "abc@clickimob.ro" }]);
    const threadId = await resolveThread(fake, {
      mailboxId: "mb-1",
      subject: "Re: Test 1",
      counterpart: "gmail@example.com",
      participants: [],
      inReplyTo: "<abc@clickimob.ro>",
    });
    expect(threadId).toBe("thread-1");
    // No key upsert needed: the header link is exact.
    expect(fake.rpcCalls).toHaveLength(0);
  });

  test("References is used when In-Reply-To is absent", async () => {
    const fake = db([{ thread_id: "thread-9", provider_message_id: "root@clickimob.ro" }]);
    expect(
      await findThreadByReferences(fake, "mb-1", [null, "<root@clickimob.ro>"]),
    ).toBe("thread-9");
  });

  test("unknown headers do not link anything (no fuzzy matching)", async () => {
    const fake = db([]);
    expect(await findThreadByReferences(fake, "mb-1", ["<nobody@elsewhere>"])).toBeNull();
  });

  test("empty header set never queries the database", async () => {
    const fake = db([]);
    expect(await findThreadByReferences(fake, "mb-1", [null, undefined, "  "])).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });
});

describe("delivery state", () => {
  test("provider events map onto the stored delivery status", () => {
    expect(deliveryStatusForEvent("accepted")).toBe("accepted");
    expect(deliveryStatusForEvent("delivered")).toBe("delivered");
    expect(deliveryStatusForEvent("temporary_fail")).toBe("temporary_fail");
    expect(deliveryStatusForEvent("permanent_fail")).toBe("permanent_fail");
  });

  test("delivered updates an accepted message", () => {
    expect(shouldApplyDelivery("accepted", "delivered")).toBe(true);
    expect(messageStatusForDelivery("delivered")).toBe("sent");
  });

  test("a permanent failure marks the message failed", () => {
    expect(shouldApplyDelivery("accepted", "permanent_fail")).toBe(true);
    expect(messageStatusForDelivery("permanent_fail")).toBe("failed");
  });

  test("a late temporary_fail never downgrades delivered", () => {
    expect(shouldApplyDelivery("delivered", "temporary_fail")).toBe(false);
  });

  test("engagement events leave delivery state untouched", () => {
    expect(deliveryStatusForEvent("opened")).toBeNull();
    expect(deliveryStatusForEvent("clicked")).toBeNull();
  });
});
