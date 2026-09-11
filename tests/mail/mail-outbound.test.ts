// Mail Center — thread preview and outbound attachments (phase 4).
import { describe, expect, test, vi } from "vitest";
import { makeFakeDb, hasOp, type FakeOp } from "./fake-db";
import { threadPreview, validateAttachmentSet, MAX_ATTACHMENT_BYTES } from "../../src/lib/mailgun";

/* ------------------------------- preview ------------------------------- */

describe("thread preview", () => {
  test("uses the stripped text of the last message", () => {
    expect(
      threadPreview({
        strippedText: "Bună ziua, revin cu detalii.",
        textBody: "vechi",
        hasHtml: false,
      }),
    ).toBe("Bună ziua, revin cu detalii.");
  });

  test("falls back to the plain body when there is no stripped text", () => {
    expect(threadPreview({ strippedText: null, textBody: "Text simplu", hasHtml: true })).toBe(
      "Text simplu",
    );
  });

  test("an HTML-only message never leaks markup into the list", () => {
    const preview = threadPreview({ strippedText: null, textBody: null, hasHtml: true });
    expect(preview).toBe("Mesaj HTML");
    expect(preview).not.toContain("<");
  });

  test("empty message without html yields no preview", () => {
    expect(threadPreview({ strippedText: "   ", textBody: null, hasHtml: false })).toBe("");
  });

  test("normalizes whitespace, newlines and control characters", () => {
    expect(threadPreview({ strippedText: "a\n\n  b\t\tc\u0000 d" })).toBe("a b c d");
  });

  test("truncates to the configured length with an ellipsis", () => {
    const preview = threadPreview({ strippedText: "x".repeat(500) }, 120);
    expect(preview.length).toBeLessThanOrEqual(121);
    expect(preview.endsWith("…")).toBe(true);
  });
});

/* ---------------------------- set validation ---------------------------- */

const file = (over: Partial<{ filename: string; contentType: string; size: number }> = {}) => ({
  filename: "raport.pdf",
  contentType: "application/pdf",
  size: 1024,
  ...over,
});

describe("outbound attachment set validation", () => {
  test("accepts an allowed set and returns sanitized names", () => {
    const res = validateAttachmentSet([file({ filename: "../../etc/passwd.pdf" })]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.files[0]!.filename).not.toContain("/");
  });

  test("rejects a disallowed mime type", () => {
    const res = validateAttachmentSet([
      file({ filename: "a.exe", contentType: "application/x-msdownload" }),
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Tip de fișier neacceptat.");
  });

  test("rejects active html/svg content", () => {
    expect(
      validateAttachmentSet([file({ filename: "x.svg", contentType: "image/svg+xml" })]).ok,
    ).toBe(false);
    expect(validateAttachmentSet([file({ filename: "x.html", contentType: "text/html" })]).ok).toBe(
      false,
    );
  });

  test("rejects a file above 10 MB", () => {
    const res = validateAttachmentSet([file({ size: MAX_ATTACHMENT_BYTES + 1 })]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Fișierul depășește 10 MB.");
  });

  test("rejects a total above 25 MB", () => {
    const res = validateAttachmentSet(
      Array.from({ length: 4 }, () => file({ size: 9 * 1024 * 1024 })),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Dimensiunea totală depășește 25 MB.");
  });

  test("rejects more than 20 files", () => {
    const res = validateAttachmentSet(Array.from({ length: 21 }, () => file()));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Maximum 20 de fișiere.");
  });
});

/* --------------------------- staging + persist -------------------------- */

const sendMailboxEmail = vi.fn();
vi.mock("@/lib/mailgun.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailgun.server")>()),
  sendMailboxEmail: (input: unknown) => sendMailboxEmail(input),
}));

const { stageOutboundAttachment, loadStagedAttachments, persistOutboundAttachments, stagingPath } =
  await import("../../src/lib/mail-outbound.server");

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPLOAD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MESSAGE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTACHMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const bytes = Buffer.from("hello world").toString("base64");

function stagingDb(over: { row?: Record<string, unknown> | null } = {}) {
  return makeFakeDb({
    handler: (table, ops: FakeOp[]) => {
      if (table === "mail_outbound_uploads") {
        if (hasOp(ops, "insert")) return { data: { id: UPLOAD }, error: null };
        if (hasOp(ops, "delete")) return { data: null, error: null };
        if (hasOp(ops, "update")) return { data: null, error: null };
        if (over.row === null) return { data: [], error: null };
        return {
          data: [
            over.row ?? {
              id: UPLOAD,
              filename: "raport.pdf",
              content_type: "application/pdf",
              size_bytes: 11,
              storage_path: stagingPath(UPLOAD),
              consumed_at: null,
              expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
          ],
          error: null,
        };
      }
      if (table === "email_attachments" && hasOp(ops, "insert")) {
        return { data: { id: ATTACHMENT }, error: null };
      }
      return { data: null, error: null };
    },
    download: () => ({
      data: { arrayBuffer: async () => Buffer.from("hello world") },
      error: null,
    }),
  });
}

describe("outbound attachment staging", () => {
  test("stores the bytes in the private bucket under an id-only path", async () => {
    const db = stagingDb();
    const res = await stageOutboundAttachment(db as never, ACTOR, {
      filename: "raport.pdf",
      contentType: "application/pdf",
      dataBase64: bytes,
    });
    expect(res.upload).toMatchObject({ id: UPLOAD, filename: "raport.pdf", size: 11 });
    expect(db.uploads[0]!.path).toBe(`outbox/${UPLOAD}`);
    // No filename anywhere in the storage path.
    expect(db.uploads[0]!.path).not.toContain("raport");
  });

  test("a rejected mime type never reaches storage", async () => {
    const db = stagingDb();
    const res = await stageOutboundAttachment(db as never, ACTOR, {
      filename: "virus.exe",
      contentType: "application/x-msdownload",
      dataBase64: bytes,
    });
    expect(res.upload).toBeNull();
    expect(res.error).toBe("Tip de fișier neacceptat.");
    expect(db.uploads).toHaveLength(0);
  });

  test("an id the caller does not own does not resolve", async () => {
    const db = stagingDb({ row: null });
    const res = await loadStagedAttachments(db as never, ACTOR, [UPLOAD]);
    expect(res.ok).toBe(false);
    // The ownership filter is part of the query, not an afterthought.
    const call = db.calls.find((c) => c.table === "mail_outbound_uploads")!;
    expect(hasOp(call.ops, "eq", "created_by", ACTOR)).toBe(true);
    expect(hasOp(call.ops, "is", "consumed_at", null)).toBe(true);
  });

  test("an expired upload is not usable", async () => {
    const db = stagingDb({
      row: {
        id: UPLOAD,
        filename: "raport.pdf",
        content_type: "application/pdf",
        size_bytes: 11,
        storage_path: stagingPath(UPLOAD),
        consumed_at: null,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    });
    expect((await loadStagedAttachments(db as never, ACTOR, [UPLOAD])).ok).toBe(false);
  });

  test("no ids means no query and no attachments", async () => {
    const db = stagingDb();
    const res = await loadStagedAttachments(db as never, ACTOR, []);
    expect(res).toEqual({ ok: true, items: [] });
    expect(db.calls).toHaveLength(0);
  });

  test("persist links the attachment to its message and moves the object", async () => {
    const db = stagingDb();
    const loaded = await loadStagedAttachments(db as never, ACTOR, [UPLOAD]);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const res = await persistOutboundAttachments(db as never, MESSAGE, loaded.items);
    expect(res.stored).toBe(1);
    expect(db.moves).toEqual([{ from: `outbox/${UPLOAD}`, to: `${MESSAGE}/${ATTACHMENT}` }]);

    const messageUpdate = db.calls.find((c) => c.table === "email_messages");
    expect(hasOp(messageUpdate!.ops, "update", { has_attachments: true })).toBe(true);
  });

  test("a failed move leaves no orphan metadata", async () => {
    const db = makeFakeDb({
      handler: (table, ops: FakeOp[]) => {
        if (table === "email_attachments" && hasOp(ops, "insert")) {
          return { data: { id: ATTACHMENT }, error: null };
        }
        return { data: null, error: null };
      },
      move: () => ({ error: { message: "gone" } }),
    });
    const res = await persistOutboundAttachments(db as never, MESSAGE, [
      {
        id: UPLOAD,
        filename: "raport.pdf",
        contentType: "application/pdf",
        size: 11,
        data: new Uint8Array([1]),
        storagePath: stagingPath(UPLOAD),
      },
    ]);
    expect(res.stored).toBe(0);
    const deleted = db.calls.find((c) => c.table === "email_attachments" && hasOp(c.ops, "delete"));
    expect(deleted).toBeTruthy();
  });
});

/* ------------------------------ send flow ------------------------------- */

const { sendMailboxMessage } = await import("../../src/lib/mail-center-admin.server");

const MAILBOX = {
  id: "11111111-1111-4111-8111-111111111111",
  address: "contact@clickimob.ro",
  display_name: "ClickImob",
  is_active: true,
};

function sendDb() {
  return makeFakeDb({
    handler: (table, ops: FakeOp[]) => {
      if (table === "mailboxes") return { data: MAILBOX, error: null };
      if (table === "mail_outbound_uploads") {
        if (hasOp(ops, "update") || hasOp(ops, "delete")) return { data: null, error: null };
        return {
          data: [
            {
              id: UPLOAD,
              filename: "raport.pdf",
              content_type: "application/pdf",
              size_bytes: 11,
              storage_path: stagingPath(UPLOAD),
              consumed_at: null,
              expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
          ],
          error: null,
        };
      }
      if (table === "email_attachments" && hasOp(ops, "insert")) {
        return { data: { id: ATTACHMENT }, error: null };
      }
      return { data: null, error: null };
    },
    download: () => ({
      data: { arrayBuffer: async () => Buffer.from("hello world") },
      error: null,
    }),
  });
}

describe("sending with attachments", () => {
  test("attaches the staged file and records it on the outbound message", async () => {
    sendMailboxEmail.mockResolvedValueOnce({
      ok: true,
      messageId: MESSAGE,
      providerMessageId: "<x@mg>",
      duplicate: false,
    });
    const db = sendDb();
    const res = await sendMailboxMessage(db as never, {
      mailboxId: MAILBOX.id,
      to: ["client@exemplu.ro"],
      subject: "Ofertă",
      text: "Detalii în atașament.",
      sendKey: "compose-1",
      attachmentIds: [UPLOAD],
      actorId: ACTOR,
    });

    expect(res.ok).toBe(true);
    expect(res.attachmentCount).toBe(1);
    const sent = sendMailboxEmail.mock.calls.at(-1)![0] as { attachments: unknown[] };
    expect(sent.attachments).toHaveLength(1);
  });

  test("a duplicate send_key neither re-sends nor duplicates attachments", async () => {
    sendMailboxEmail.mockResolvedValueOnce({
      ok: true,
      messageId: MESSAGE,
      providerMessageId: "<x@mg>",
      duplicate: true,
    });
    const db = sendDb();
    const res = await sendMailboxMessage(db as never, {
      mailboxId: MAILBOX.id,
      to: ["client@exemplu.ro"],
      subject: "Ofertă",
      text: "Detalii.",
      sendKey: "compose-1",
      attachmentIds: [UPLOAD],
      actorId: ACTOR,
    });
    expect(res.duplicate).toBe(true);
    expect(res.attachmentCount).toBe(0);
    expect(db.moves).toHaveLength(0);
  });

  test("an unknown attachment id blocks the send entirely", async () => {
    const db = makeFakeDb({
      handler: (table) =>
        table === "mailboxes" ? { data: MAILBOX, error: null } : { data: [], error: null },
    });
    const res = await sendMailboxMessage(db as never, {
      mailboxId: MAILBOX.id,
      to: ["client@exemplu.ro"],
      subject: "Ofertă",
      text: "Detalii.",
      sendKey: "compose-2",
      attachmentIds: ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"],
      actorId: ACTOR,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Atașament indisponibil.");
  });

  test("a failed send stores nothing, so a retry stays idempotent", async () => {
    sendMailboxEmail.mockResolvedValueOnce({ ok: false, error: "Trimiterea a eșuat." });
    const db = sendDb();
    const res = await sendMailboxMessage(db as never, {
      mailboxId: MAILBOX.id,
      to: ["client@exemplu.ro"],
      subject: "Ofertă",
      text: "Detalii.",
      sendKey: "compose-3",
      attachmentIds: [UPLOAD],
      actorId: ACTOR,
    });
    expect(res.ok).toBe(false);
    expect(db.moves).toHaveLength(0);
    expect(db.calls.some((c) => c.table === "email_attachments" && hasOp(c.ops, "insert"))).toBe(
      false,
    );
  });
});
