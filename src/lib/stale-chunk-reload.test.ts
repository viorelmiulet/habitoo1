import { describe, expect, it } from "vitest";
import { decideStaleAction, isChunkLoadError } from "./stale-chunk-reload";

describe("decideStaleAction", () => {
  const now = 1_000_000;
  it("reîncarcă fără marcaj", () => {
    expect(decideStaleAction(null, now)).toBe("reload");
  });
  it("arată mesajul dacă a fost o reîncărcare acum 10 s", () => {
    expect(decideStaleAction(String(now - 10_000), now)).toBe("message");
  });
  it("reîncarcă dacă marcajul are peste 30 s", () => {
    expect(decideStaleAction(String(now - 31_000), now)).toBe("reload");
  });
  it("recunoaște erorile de import dinamic", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: x.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("altceva"))).toBe(false);
  });
});
