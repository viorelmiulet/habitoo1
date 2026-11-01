import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceGmailMime,
  sendWorkspaceGmail,
  workspaceGmailSendError,
} from "@/lib/gmail/gmail-workspace.server";

vi.mock("@/lib/mailgun.server", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

const KEYS = ["LOVABLE_API_KEY", "GOOGLE_MAIL_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.LOVABLE_API_KEY = "lov";
  process.env.GOOGLE_MAIL_API_KEY = "conn";
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const b64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));
const msg = {
  from: "Habitoo CRM <contact@habitoo.ro>",
  to: "suport@vdi.ro",
  cc: "contact@habitoo.ro",
  replyTo: "admin@agentie.ro",
  subject: "Cerere activare – Agenția Ștefănești",
  text: "Bună ziua, ăîșț",
  html: "<p>Bună ziua, ăîșț</p>",
};

function stubFetch(sendStatus = 200) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/profile")) return new Response(JSON.stringify({ emailAddress: "contact@habitoo.ro" }));
    return new Response(sendStatus === 200 ? JSON.stringify({ id: "gm-1" }) : "secret google body", { status: sendStatus });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

describe("mesajul MIME", () => {
  const mime = buildWorkspaceGmailMime(msg, "B");
  it("codează subiectul cu diacritice RFC 2047", () => {
    const m = /^Subject: =\?UTF-8\?B\?([^?]+)\?=$/m.exec(mime);
    expect(m).not.toBeNull();
    expect(b64(m![1])).toBe(msg.subject);
  });
  it("conține text și HTML în multipart/alternative", () => {
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="B"');
    const parts = mime.split("--B");
    expect(b64(parts[1].split("\r\n\r\n")[1])).toBe(msg.text);
    expect(b64(parts[2].split("\r\n\r\n")[1])).toBe(msg.html);
  });
  it("include Cc și Reply-To", () => {
    expect(mime).toMatch(/^Cc: contact@habitoo\.ro$/m);
    expect(mime).toMatch(/^Reply-To: admin@agentie\.ro$/m);
    expect(mime).toMatch(/^From: "Habitoo CRM" <contact@habitoo\.ro>$/m);
  });
  it("refuză CR/LF în antete", () => {
    expect(() => buildWorkspaceGmailMime({ ...msg, subject: "x\r\nBcc: a@b.ro" })).toThrow();
    expect(() => buildWorkspaceGmailMime({ ...msg, replyTo: "a@b.ro\nBcc: c@d.ro" })).toThrow();
  });
});

describe("sendWorkspaceGmail", () => {
  it("trimite prin gateway cu raw base64url", async () => {
    const f = stubFetch();
    const r = await sendWorkspaceGmail(msg);
    expect(r).toEqual({ ok: true, gmailMessageId: "gm-1" });
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Connection-Api-Key"]).toBe("conn");
    const raw = JSON.parse(String(init.body)).raw as string;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("refuză un expeditor nepermis, fără trimitere", async () => {
    const f = stubFetch();
    const r = await sendWorkspaceGmail({ ...msg, from: "Altcineva <office@habitoo.ro>" });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429, 500])("mapează HTTP %i fără corpul Google", async (status) => {
    stubFetch(status);
    const r = await sendWorkspaceGmail(msg);
    expect(r).toEqual({ ok: false, error: workspaceGmailSendError(status) });
    expect(JSON.stringify(r)).not.toContain("secret google body");
  });
});

describe("alegerea transportului", () => {
  it("folosește Gmail când e configurat", async () => {
    stubFetch();
    const { sendKeyRequestEmail } = await import("@/lib/portals/imospot-key-request.server");
    const { sendEmail } = await import("@/lib/mailgun.server");
    const r = await sendKeyRequestEmail(msg as never);
    expect(r).toEqual({ ok: true, transport: "gmail" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("revine la Mailgun fără configurare Gmail", async () => {
    delete process.env.GOOGLE_MAIL_API_KEY;
    const f = stubFetch();
    const { sendKeyRequestEmail } = await import("@/lib/portals/imospot-key-request.server");
    const { sendEmail } = await import("@/lib/mailgun.server");
    const r = await sendKeyRequestEmail(msg as never);
    expect(r).toEqual({ ok: true, transport: "mailgun" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(f).not.toHaveBeenCalled();
  });
});
