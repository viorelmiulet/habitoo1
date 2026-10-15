import { describe, expect, it } from "vitest";
import { cleanTrackId, isHttpsUrl, parseMusicChoice, resolveMusicChoice, serializeMusicChoice, validateTrackInput } from "./video-music";

const ok = { title: "Piano", style: "Calm", sourceUrl: "https://pixabay.com/music/x-123/", license: "Pixabay Content License", requireFile: true, file: { name: "a.mp3", type: "audio/mpeg", size: 1000 } };

describe("validare piese", () => {
  it("acceptă o piesă completă", () => expect(validateTrackInput(ok)).toBeNull());
  it("doar MP3", () => expect(validateTrackInput({ ...ok, file: { name: "a.wav", type: "audio/wav", size: 10 } })).toBe("Fișierul trebuie să fie MP3."));
  it("max 10 MB", () => {
    expect(validateTrackInput({ ...ok, file: { ...ok.file, size: 10 * 1024 * 1024 } })).toBeNull();
    expect(validateTrackInput({ ...ok, file: { ...ok.file, size: 10 * 1024 * 1024 + 1 } })).toBe("Fișierul MP3 depășește 10 MB.");
  });
  it("link sursă opțional, orice site https", () => {
    expect(validateTrackInput({ ...ok, sourceUrl: "" })).toBeNull();
    expect(validateTrackInput({ ...ok, sourceUrl: "https://youtube.com/x" })).toBeNull();
    expect(isHttpsUrl("https://www.example.com/a")).toBe(true);
    expect(isHttpsUrl("http://example.com/a")).toBe(false);
    expect(validateTrackInput({ ...ok, sourceUrl: "http://example.com/a" })).toBe("Linkul sursă trebuie să fie un link https valid.");
    expect(validateTrackInput({ ...ok, sourceUrl: "nu e link" })).toBe("Linkul sursă trebuie să fie un link https valid.");
  });
  it("licența e obligatorie, text liber permis", () => {
    expect(validateTrackInput({ ...ok, license: "" })).toBe("Completează licența.");
    expect(validateTrackInput({ ...ok, license: "Licența mea custom" })).toBeNull();
  });
  it("se salvează fără bifă Content ID", () => expect(validateTrackInput({ ...ok })).toBeNull());
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
