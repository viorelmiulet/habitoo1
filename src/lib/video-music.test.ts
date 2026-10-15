import { describe, expect, it } from "vitest";
import { cleanTrackId, isPixabayUrl, parseMusicChoice, resolveMusicChoice, serializeMusicChoice, validateTrackInput } from "./video-music";

const ok = { title: "Piano", style: "Calm", sourceUrl: "https://pixabay.com/music/x-123/", contentIdChecked: true, requireFile: true, file: { name: "a.mp3", type: "audio/mpeg", size: 1000 } };

describe("validare piese", () => {
  it("acceptă o piesă completă", () => expect(validateTrackInput(ok)).toBeNull());
  it("doar MP3", () => expect(validateTrackInput({ ...ok, file: { name: "a.wav", type: "audio/wav", size: 10 } })).toBe("Fișierul trebuie să fie MP3."));
  it("max 10 MB", () => {
    expect(validateTrackInput({ ...ok, file: { ...ok.file, size: 10 * 1024 * 1024 } })).toBeNull();
    expect(validateTrackInput({ ...ok, file: { ...ok.file, size: 10 * 1024 * 1024 + 1 } })).toBe("Fișierul MP3 depășește 10 MB.");
  });
  it("link doar de pe Pixabay", () => {
    expect(isPixabayUrl("https://www.pixabay.com/music/a")).toBe(true);
    expect(isPixabayUrl("https://pixabay.com.evil.ro/a")).toBe(false);
    expect(isPixabayUrl("http://pixabay.com/a")).toBe(false);
    expect(validateTrackInput({ ...ok, sourceUrl: "https://youtube.com/x" })).toBe("Linkul trebuie să fie de pe pixabay.com.");
    expect(validateTrackInput({ ...ok, sourceUrl: "" })).toBe("Linkul Pixabay este obligatoriu.");
  });
  it("bifa Content ID obligatorie", () => expect(validateTrackInput({ ...ok, contentIdChecked: false })).toBe("Confirmă că piesa nu are Content ID."));
  it("MP3 obligatoriu la adăugare", () => expect(validateTrackInput({ ...ok, file: null })).toBe("Alege fișierul MP3."));
});

describe("alegerea memorată", () => {
  it("piesă activă rămâne aleasă", () => expect(resolveMusicChoice({ kind: "track", id: "a" }, ["a"])).toEqual({ kind: "track", id: "a" }));
  it("piesă dezactivată revine la Fără muzică", () => expect(resolveMusicChoice({ kind: "track", id: "a" }, ["b"])).toEqual({ kind: "none" }));
  it("serializare", () => {
    expect(parseMusicChoice(serializeMusicChoice({ kind: "track", id: "x" }))).toEqual({ kind: "track", id: "x" });
    expect(parseMusicChoice("own")).toEqual({ kind: "own" });
    expect(parseMusicChoice(null)).toEqual({ kind: "none" });
  });
  it("id piesă în istoric doar uuid", () => {
    expect(cleanTrackId("11111111-1111-1111-1111-111111111111")).toBe("11111111-1111-1111-1111-111111111111");
    expect(cleanTrackId("abc")).toBeNull();
    expect(cleanTrackId(null)).toBeNull();
  });
});
