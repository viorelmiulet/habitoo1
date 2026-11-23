import { describe, expect, it } from "vitest";
import { buildVideoSubtitles, type VideoListing } from "./property-video";
const listing: VideoListing = { title: "Apartament", district: "Centru", city: "Cluj-Napoca", price: "90.000 EUR", rooms: 2, usableSurface: 65.5, floor: null, reference: "HB-1", agentName: "Privat", agentPhone: "confidențial", logoUrl: null };
describe("subtitrare numai din anunț", () => {
  it("preț/camere/suprafață/zonă păstrează exact valorile și nu expune contacte", () => {
    expect(buildVideoSubtitles(listing, 4, 3, true).map((s) => s.text)).toEqual(["90.000 EUR", "2 camere", "65.5 mp utili", "Centru, Cluj-Napoca"]);
  });
  it("nu inventează valorile lipsă și respectă opțiunea fără preț", () => {
    expect(buildVideoSubtitles({ ...listing, rooms: null, usableSurface: null, district: null, city: null }, 4, 3, false)).toEqual([]);
  });
  it("subtitrările sunt continue pe fotografii, nu acoperă intro/outro", () => {
    const captions = buildVideoSubtitles(listing, 4, 3, true);
    expect(captions).toEqual([{ start: 3, end: 6, text: "90.000 EUR" }, { start: 6, end: 9, text: "2 camere" }, { start: 9, end: 12, text: "65.5 mp utili" }, { start: 12, end: 15, text: "Centru, Cluj-Napoca" }]);
  });
});