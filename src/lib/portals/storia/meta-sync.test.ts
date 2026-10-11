import { describe, expect, it } from "vitest";
import { fetchAllStoriaMeta, metaSyncDecision, metaToNotification, parseStoriaMetaRecord } from "./meta-sync";
import { storiaListingStatus } from "./adverts.server";
import { readEventShape } from "./leads.server";

const UUID = "439a8608-1b6c-4b56-a42b-f9473e4430e9";
const meta = (state: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  parseStoriaMetaRecord({ uuid: UUID, state, last_action_at: "2026-10-11T18:00:00Z", ...extra })!;
const pending = { status: "pending", lastEventAt: null, publicUrl: null };

describe("Storia /meta sync", () => {
  it("active → publicat cu link și slug", () => {
    const m = meta({ code: "active", url: "https://www.storia.ro/ro/oferta/apartament-IDINUx.html" });
    expect(storiaListingStatus(m.code)).toBe("published");
    expect(metaSyncDecision(m, pending, "published")).toBe("apply");
    const shape = readEventShape(metaToNotification(m))!;
    expect(shape.advertUuid).toBe(UUID);
    expect(shape.publicUrl).toBe("https://www.storia.ro/ro/oferta/apartament-IDINUx.html");
    expect(shape.adSlug).toBe("INUx");
  });

  it("moderated → respins cu motiv", () => {
    const m = meta({ code: "moderated", moderation: { reason: "Poze necorespunzătoare" } });
    expect(storiaListingStatus(m.code)).toBe("error");
    const shape = readEventShape(metaToNotification(m))!;
    expect((shape.data as any).moderation.reason).toBe("Poze necorespunzătoare");
  });

  it("outdated → expirat", () => {
    expect(storiaListingStatus(meta({ code: "outdated" }).code)).toBe("expired");
  });

  it("last_error este citit", () => {
    expect(meta({ code: "new" }, { last_error: { message: "Lipsește prețul" } }).lastError).toBe("Lipsește prețul");
  });

  it("paginarea urmează links.next, 2 cereri/s", async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const pages: Record<string, unknown> = {
      "/advert/v1/meta?limit=100&page=1": {
        data: [{ uuid: UUID, state: { code: "active" } }],
        links: { next: "https://api.olxgroup.com/advert/v1/meta?limit=100&page=2" },
      },
      "/advert/v1/meta?limit=100&page=2": {
        data: [{ uuid: "11111111-1111-4111-8111-111111111111", state: { code: "outdated" } }],
        links: { next: null },
      },
    };
    const out = await fetchAllStoriaMeta(
      async (p) => {
        calls.push(p);
        return { status: 200, body: pages[p] as any };
      },
      async (ms) => {
        sleeps.push(ms);
      },
    );
    expect(calls).toHaveLength(2);
    expect(out.records.map((r) => r.code)).toEqual(["active", "outdated"]);
    expect(out.complete).toBe(true);
    expect(sleeps).toEqual([500]);
  });

  it("o notificare mai nouă nu e suprascrisă", () => {
    const m = meta({ code: "moderated" }, { last_action_at: "2026-10-11T10:00:00Z" });
    expect(
      metaSyncDecision(m, { status: "published", lastEventAt: "2026-10-11T12:00:00Z", publicUrl: null }, "error"),
    ).toBe("skip");
  });
});
