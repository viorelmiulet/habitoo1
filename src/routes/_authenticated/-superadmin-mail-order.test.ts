import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  messageDisplayDate,
  sortMessagesNewestFirst,
  type DatedMessage,
} from "@/lib/mail-order";

type Row = DatedMessage & { direction: string; subject: string };

const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  direction: "inbound",
  subject: id,
  received_at: null,
  sent_at: null,
  created_at: null,
  ...over,
});

const older = row("m-1", {
  received_at: "2026-10-08T10:00:00.000Z",
  created_at: "2026-10-08T10:00:00.000Z",
});
const middle = row("m-2", {
  received_at: "2026-10-08T12:00:00.000Z",
  created_at: "2026-10-08T12:00:00.000Z",
});
const newest = row("m-3", {
  received_at: "2026-10-08T14:00:00.000Z",
  created_at: "2026-10-08T14:00:00.000Z",
});

/** Așa vine răspunsul de la server: crescător, cel mai vechi primul. */
const serverOrder = [older, middle, newest];

describe("conversația se afișează de la cel mai nou mesaj", () => {
  it("la trei mesaje, primul card afișat este cel mai recent", () => {
    expect(sortMessagesNewestFirst(serverOrder).map((m) => m.id)).toEqual([
      "m-3",
      "m-2",
      "m-1",
    ]);
  });

  it("după trimiterea unui răspuns, acesta apare primul", () => {
    const reply = row("m-4", {
      direction: "outbound",
      sent_at: "2026-10-08T15:30:00.000Z",
      created_at: "2026-10-08T15:30:00.000Z",
    });
    const after = sortMessagesNewestFirst([...serverOrder, reply]);
    expect(after[0]?.id).toBe("m-4");
    expect(after.map((m) => m.id)).toEqual(["m-4", "m-3", "m-2", "m-1"]);
  });

  it("sortarea nu modifică datele din cache", () => {
    sortMessagesNewestFirst(serverOrder);
    expect(serverOrder.map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("data afișată urmează cardul: received_at, apoi sent_at, apoi created_at", () => {
    expect(
      messageDisplayDate(
        row("a", {
          received_at: "2026-10-08T10:00:00.000Z",
          sent_at: "2026-10-09T10:00:00.000Z",
          created_at: "2026-10-10T10:00:00.000Z",
        }),
      ),
    ).toBe(Date.parse("2026-10-08T10:00:00.000Z"));
    expect(
      messageDisplayDate(
        row("b", {
          sent_at: "2026-10-08T11:00:00.000Z",
          created_at: "2026-10-09T10:00:00.000Z",
        }),
      ),
    ).toBe(Date.parse("2026-10-08T11:00:00.000Z"));
    expect(
      messageDisplayDate(row("c", { created_at: "2026-10-08T12:00:00.000Z" })),
    ).toBe(Date.parse("2026-10-08T12:00:00.000Z"));
    expect(messageDisplayDate(row("d"))).toBe(0);
  });

  it("la aceeași dată afișată, cel cu created_at mai nou rămâne primul", () => {
    const early = row("x", {
      sent_at: "2026-10-08T10:00:00.000Z",
      created_at: "2026-10-08T09:59:00.000Z",
    });
    const late = row("y", {
      sent_at: "2026-10-08T10:00:00.000Z",
      created_at: "2026-10-08T10:01:00.000Z",
    });
    expect(sortMessagesNewestFirst([early, late]).map((m) => m.id)).toEqual([
      "y",
      "x",
    ]);
  });
});

