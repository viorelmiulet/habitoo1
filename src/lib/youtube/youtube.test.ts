import { describe, expect, it, vi } from "vitest";
import {
  YT_CATEGORY_ID,
  buildYoutubeOAuthUrl,
  classifyYoutubeError,
  refreshYoutubeToken,
  startResumableUpload,
  youtubeDescription,
  youtubeTags,
  youtubeTitle,
  youtubeVideoResource,
} from "./core";
import { signYoutubeState, verifyYoutubeState } from "./state.server";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers });

describe("YouTube", () => {
  it("verifică state-ul semnat, legat de agenție și utilizator, 10 minute", () => {
    const now = 1_000_000;
    const s = signYoutubeState({ organizationId: "org", userId: "u" }, "sec", now);
    expect(verifyYoutubeState(s, "sec", now + 1000)).toMatchObject({ organizationId: "org", userId: "u" });
    expect(verifyYoutubeState(s, "alt", now)).toBeNull();
    expect(verifyYoutubeState(s, "sec", now + 10 * 60 * 1000 + 1)).toBeNull();
    expect(verifyYoutubeState(s.replace(/^./, "x"), "sec", now)).toBeNull();
    const u = new URL(buildYoutubeOAuthUrl(s));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });

  it("reîmprospătează tokenul și tratează invalid_grant ca expirat", async () => {
    const f = vi.fn().mockResolvedValue(json({ access_token: "AT" }));
    await expect(refreshYoutubeToken("RT", "sec", f)).resolves.toBe("AT");
    expect(String(f.mock.calls[0]![1].body)).toContain("grant_type=refresh_token");
    const bad = vi.fn().mockResolvedValue(json({ error: "invalid_grant" }, 400));
    await expect(refreshYoutubeToken("RT", "sec", bad)).rejects.toMatchObject({ kind: "expired" });
  });

  it("titlul are maximum 100 de caractere", () => {
    expect(youtubeTitle("Apartament 2 camere", "120.000 €")).toBe("Apartament 2 camere – 120.000 €");
    expect([...youtubeTitle("A".repeat(150), "1 €")].length).toBe(100);
  });

  it("descrierea conține linkul /oferta/<id>, sub 5000 de caractere", () => {
    expect(youtubeDescription("Text", "abc")).toBe("Text\n\nhttps://www.habitoo.ro/oferta/abc");
    const long = youtubeDescription("x".repeat(6000), "abc");
    expect(long.length).toBeLessThanOrEqual(5000);
    expect(long.endsWith("https://www.habitoo.ro/oferta/abc")).toBe(true);
  });

  it("etichetele din hashtaguri rămân sub 500 de caractere", () => {
    expect(youtubeTags(["#Bucuresti", "#apartament"])).toEqual(["Bucuresti", "apartament"]);
    expect(youtubeTags(Array.from({ length: 100 }, (_, i) => `#eticheta${i}`)).join(",").length).toBeLessThanOrEqual(500);
  });

  it("trimite categoria 22, vizibilitatea și madeForKids false", async () => {
    const r = youtubeVideoResource({ title: "T", description: "D", tags: ["a"], privacy: "unlisted" });
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { location: "https://upload/x" } }));
    await expect(startResumableUpload("AT", r, 10, f)).resolves.toBe("https://upload/x");
    const [, init] = f.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.snippet.categoryId).toBe(YT_CATEGORY_ID);
    expect(body.snippet.categoryId).toBe("22");
    expect(body.status).toEqual({ privacyStatus: "unlisted", selfDeclaredMadeForKids: false });
    expect(init.headers.origin).toBe("https://crm.habitoo.ro");
  });

  it("limita zilnică are mesaj clar", () => {
    expect(classifyYoutubeError({ error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }).kind).toBe("quota");
  });
});
