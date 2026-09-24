import { describe, expect, it } from "vitest";
import { pickThread, statusAfterMessage } from "./mail-thread-rules";

const now = new Date("2026-09-24T20:00:00Z");
const recent = { id: "t1", participants: ["contact@mvaimobiliare.ro"], lastMessageAt: "2026-09-20T10:00:00Z" };
const old = { id: "t0", participants: ["contact@mvaimobiliare.ro"], lastMessageAt: "2026-08-01T10:00:00Z" };

describe("pickThread", () => {
  it("răspuns cu In-Reply-To → aceeași conversație", () => {
    expect(pickThread({ headerThreadId: "hdr", candidates: [], counterpart: "x@gmail.com", now })).toBe("hdr");
  });
  it("același subiect, alt expeditor → conversație nouă", () => {
    expect(pickThread({ headerThreadId: null, candidates: [recent], counterpart: "altcineva@gmail.com", now })).toBeNull();
  });
  it("același subiect și expeditor, mai vechi de 30 de zile → conversație nouă", () => {
    expect(pickThread({ headerThreadId: null, candidates: [old], counterpart: "contact@mvaimobiliare.ro", now })).toBeNull();
  });
  it("același subiect și expeditor, recent → aceeași conversație", () => {
    expect(pickThread({ headerThreadId: null, candidates: [old, recent], counterpart: "Contact@MVAimobiliare.ro", now })).toBe("t1");
  });
});

describe("statusAfterMessage", () => {
  it("mesaj primit în conversație arhivată → redeschisă", () => {
    expect(statusAfterMessage("archived", "inbound")).toBe("open");
  });
  it("mesaj trimis în conversație arhivată → rămâne arhivată", () => {
    expect(statusAfterMessage("archived", "outbound")).toBe("archived");
  });
  it("spam și coș nu se schimbă", () => {
    expect(statusAfterMessage("spam", "inbound")).toBe("spam");
    expect(statusAfterMessage("trash", "inbound")).toBe("trash");
  });
});
