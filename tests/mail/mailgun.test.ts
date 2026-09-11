// Mail Center — pure helpers. No network, no database.
import { createHmac } from "crypto";
import { describe, expect, test } from "vitest";
import {
  deliveryStatusForEvent,
  deriveThreadKey,
  hashRecipient,
  messageStatusForDelivery,
  shouldApplyDelivery,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  MAX_TOTAL_ATTACHMENT_BYTES,
  normalizeEvent,
  normalizeInbound,
  normalizeMessageId,
  normalizeSubject,
  parseAddress,
  parseAddressList,
  safeLogFields,
  sanitizeFilename,
  validateAttachment,
  validateOutbound,
} from "../../src/lib/mailgun";
import { verifyMailgunSignature } from "../../src/lib/mailgun.server";

describe("addresses", () => {
  test("parses display name form", () => {
    expect(parseAddress('"Ana Pop" <Ana@Example.RO>')).toEqual({
      name: "Ana Pop",
      email: "ana@example.ro",
    });
  });

  test("parses a list and drops invalid entries", () => {
    expect(parseAddressList("a@b.ro, broken, c@d.ro")).toEqual(["a@b.ro", "c@d.ro"]);
  });
});

describe("threading", () => {
  test("strips reply prefixes, including Romanian", () => {
    expect(normalizeSubject("Re: Fwd: Răspuns: Ofertă")).toBe("Ofertă");
  });

  test("message ids lose angle brackets", () => {
    expect(normalizeMessageId("<abc@mg.ro>")).toBe("abc@mg.ro");
  });

  test("references win over subject", () => {
    const byRef = deriveThreadKey({ references: ["<root@x>"], subject: "Alt subiect" });
    const bySubject = deriveThreadKey({ subject: "Re: Ofertă", counterpart: "a@b.ro" });
    expect(byRef).toBe("mid:root@x");
    expect(bySubject).toBe("subj:a@b.ro|ofertă");
  });

  test("reply and original group together by subject", () => {
    const a = deriveThreadKey({ subject: "Ofertă", counterpart: "a@b.ro" });
    const b = deriveThreadKey({ subject: "RE: Ofertă", counterpart: "A@B.ro" });
    expect(a).toBe(b);
  });
});

describe("attachments", () => {
  test("blocks executables and scripts by extension", () => {
    const r = validateAttachment({ filename: "x.exe", contentType: "application/pdf", size: 10 });
    expect(r).toMatchObject({ ok: false, reason: "extension_blocked" });
  });

  test("blocks disallowed mime types", () => {
    const r = validateAttachment({ filename: "a.bin", contentType: "application/octet-stream", size: 10 });
    expect(r).toMatchObject({ ok: false, reason: "mime_not_allowed" });
  });

  test("blocks oversized files", () => {
    const r = validateAttachment({ filename: "a.pdf", contentType: "application/pdf", size: 20e6 });
    expect(r).toMatchObject({ ok: false, reason: "size_exceeded" });
  });

  test("accepts a normal pdf", () => {
    expect(validateAttachment({ filename: "of.pdf", contentType: "application/pdf; charset=x", size: 1000 })).toEqual({
      ok: true,
      filename: "of.pdf",
    });
  });

  test("sanitizes traversal in filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
  });
});

describe("outbound validation", () => {
  const allowed = ["@clickimob.ro"];
  const base = { to: "client@x.ro", subject: "Salut", text: "Mesaj" };

  test("falls back to the default sender", () => {
    const r = validateOutbound(base, allowed, "noreply@clickimob.ro");
    expect(r.ok && r.value.from).toBe("noreply@clickimob.ro");
  });

  test("rejects spoofed senders", () => {
    const r = validateOutbound({ ...base, from: "ceo@banca.ro" }, allowed, "noreply@clickimob.ro");
    expect(r.ok).toBe(false);
  });

  test("rejects header injection in the subject", () => {
    const r = validateOutbound({ ...base, subject: "a\r\nBcc: x@y.ro" }, allowed, "noreply@clickimob.ro");
    expect(r.ok).toBe(false);
  });

  test("rejects empty bodies and missing recipients", () => {
    expect(validateOutbound({ to: "a@b.ro", subject: "S" }, allowed, "n@clickimob.ro").ok).toBe(false);
    expect(validateOutbound({ to: "nope", subject: "S", text: "x" }, allowed, "n@clickimob.ro").ok).toBe(false);
  });
});

describe("signature verification", () => {
  const key = "signing-key";
  const token = "a".repeat(50);
  const now = 1_700_000_000;
  const sign = (ts: number) => createHmac("sha256", key).update(`${ts}${token}`).digest("hex");

  test("accepts a valid signature", () => {
    expect(verifyMailgunSignature({ timestamp: String(now), token, signature: sign(now) }, key, now)).toEqual({
      ok: true,
    });
  });

  test("rejects a tampered signature", () => {
    const bad = sign(now).replace(/^./, (c) => (c === "0" ? "1" : "0"));
    expect(verifyMailgunSignature({ timestamp: String(now), token, signature: bad }, key, now).ok).toBe(false);
  });

  test("rejects replays outside the window", () => {
    const old = now - 3600;
    const r = verifyMailgunSignature({ timestamp: String(old), token, signature: sign(old) }, key, now);
    expect(r).toMatchObject({ ok: false, reason: "timestamp" });
  });

  test("rejects missing fields", () => {
    expect(verifyMailgunSignature({}, key, now)).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("inbound normalization", () => {
  test("maps a Mailgun route payload", () => {
    const inbound = normalizeInbound({
      from: "Ana <ana@x.ro>",
      recipient: "contact@clickimob.ro",
      subject: "Re: Ofertă",
      "body-plain": "text",
      "Message-Id": "<m1@x.ro>",
      "In-Reply-To": "<m0@x.ro>",
      References: "<m0@x.ro>",
      "message-size": "1234",
    });
    expect(inbound.fromEmail).toBe("ana@x.ro");
    expect(inbound.recipients).toEqual(["contact@clickimob.ro"]);
    expect(inbound.providerMessageId).toBe("m1@x.ro");
    expect(inbound.references).toEqual(["m0@x.ro"]);
    expect(inbound.sizeBytes).toBe(1234);
  });

  test("parses attachment metadata json", () => {
    const inbound = normalizeInbound({
      from: "a@b.ro",
      recipient: "c@clickimob.ro",
      attachments: JSON.stringify([{ name: "of.pdf", "content-type": "application/pdf", size: 12, url: "u" }]),
    });
    expect(inbound.attachments[0]).toMatchObject({ filename: "of.pdf", size: 12 });
  });
});

describe("events", () => {
  test("normalizes a delivered event", () => {
    const e = normalizeEvent({
      id: "evt-1",
      event: "delivered",
      timestamp: 1_700_000_000,
      recipient: "A@B.ro",
      message: { headers: { "message-id": "m1@x.ro" } },
    });
    expect(e).toMatchObject({ eventKey: "evt-1", eventType: "delivered", providerMessageId: "m1@x.ro" });
  });

  test("drops events without an id or a known type", () => {
    expect(normalizeEvent({ event: "delivered" })).toBeNull();
    expect(normalizeEvent({ id: "x", event: "whatever" })).toBeNull();
  });

  test("maps event types to delivery status", () => {
    expect(deliveryStatusForEvent("permanent_fail")).toBe("permanent_fail");
    expect(deliveryStatusForEvent("opened")).toBeNull();
  });
});

describe("log safety", () => {
  test("never logs bodies, keys or signatures", () => {
    const safe = safeLogFields({
      "body-plain": "secret text",
      signature: "abc",
      MAILGUN_API_KEY: "k",
      status: 200,
    });
    expect(safe).toEqual({ status: 200 });
  });

  test("recipient hashing is stable and non-reversible", () => {
    const h = hashRecipient("ana@x.ro");
    expect(h).toBe(hashRecipient("ana@x.ro"));
    expect(h).not.toContain("ana");
  });
});

describe("status model", () => {
  test("delivery and message status are separate axes", () => {
    // A message we sent successfully can still fail at the provider.
    expect(messageStatusForDelivery("permanent_fail")).toBe("failed");
    expect(messageStatusForDelivery("delivered")).toBe("sent");
    // Engagement outcomes never rewrite the lifecycle.
    expect(messageStatusForDelivery("complained")).toBeNull();
  });

  test("out-of-order webhooks never downgrade a stronger outcome", () => {
    expect(shouldApplyDelivery("delivered", "temporary_fail")).toBe(false);
    expect(shouldApplyDelivery("temporary_fail", "delivered")).toBe(true);
    expect(shouldApplyDelivery("delivered", "permanent_fail")).toBe(true);
    expect(shouldApplyDelivery(null, "accepted")).toBe(true);
  });

  test("a repeated event of the same rank is still applied", () => {
    expect(shouldApplyDelivery("delivered", "delivered")).toBe(true);
  });
});

describe("delivery events — failures", () => {
  const base = { id: "e", timestamp: 1_700_000_000, message: { headers: { "message-id": "m@x" } } };

  test("temporary failure keeps the message recoverable", () => {
    const e = normalizeEvent({ ...base, event: "temporary_fail", severity: "temporary", reason: "greylisted" });
    expect(deliveryStatusForEvent(e!.eventType)).toBe("temporary_fail");
    expect(e!.reason).toBe("greylisted");
  });

  test("permanent failure carries the smtp code", () => {
    const e = normalizeEvent({ ...base, event: "permanent_fail", "delivery-status": { code: 550 } });
    expect(deliveryStatusForEvent(e!.eventType)).toBe("permanent_fail");
    expect(e!.errorCode).toBe("550");
  });

  test("duplicate deliveries normalize to the same event key", () => {
    const a = normalizeEvent({ ...base, event: "delivered" });
    const b = normalizeEvent({ ...base, event: "delivered" });
    // Same key -> the unique (provider, event_key) index collapses the retry.
    expect(a!.eventKey).toBe(b!.eventKey);
  });
});

describe("attachment limits", () => {
  test("caps the number of attachments per message", () => {
    expect(MAX_ATTACHMENT_COUNT).toBeLessThanOrEqual(20);
  });

  test("rejects active html and svg payloads", () => {
    expect(validateAttachment({ filename: "a.svg", contentType: "image/svg+xml", size: 10 }).ok).toBe(false);
    expect(validateAttachment({ filename: "a.html", contentType: "text/html", size: 10 }).ok).toBe(false);
  });

  test("total size cap is stricter than count x per-file", () => {
    expect(MAX_TOTAL_ATTACHMENT_BYTES).toBeLessThan(MAX_ATTACHMENT_COUNT * MAX_ATTACHMENT_BYTES);
  });
});

describe("threading fallbacks", () => {
  test("different senders with the same subject stay apart", () => {
    const a = deriveThreadKey({ subject: "Ofertă", counterpart: "a@b.ro" });
    const b = deriveThreadKey({ subject: "Ofertă", counterpart: "c@d.ro" });
    expect(a).not.toBe(b);
  });

  test("in-reply-to beats references and subject", () => {
    expect(deriveThreadKey({ inReplyTo: "<r@x>", references: ["<other@x>"], subject: "S" })).toBe("mid:r@x");
  });
});

describe("secret isolation", () => {
  test("no mailgun credential appears in the pure helper module", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../src/lib/mailgun.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/MAILGUN_API_KEY|MAILGUN_WEBHOOK_SIGNING_KEY|process\.env/);
  });

  test("safe log fields drop tokens and recipients", () => {
    expect(safeLogFields({ token: "t", recipient: "a@b.ro", reason: "greylisted" })).toEqual({
      reason: "greylisted",
    });
  });
});
