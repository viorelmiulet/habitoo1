import { describe, expect, it } from "vitest";
import { extractRomimoLinks } from "../offer-links";

describe("Romimo: linkuri publice", () => {
  it("extrage romimoUrl și publi24Url (și din forma jurnalizată)", () => {
    const body = {
      romimoUrl: "https://www.romimo.ro/ABC.htm",
      publi24Url: "https://www.publi24.ro/ABC.htm",
    };
    for (const r of [body, { body, http_status: 200 }]) {
      const links = extractRomimoLinks(r, "HB-1075");
      expect(links.publicUrl).toBe("https://www.romimo.ro/ABC.htm");
      expect(links.offers.map((o) => [o.label, o.url])).toEqual([
        ["Romimo", "https://www.romimo.ro/ABC.htm"],
        ["Publi24", "https://www.publi24.ro/ABC.htm"],
      ]);
    }
  });

  it("fără linkuri sau domeniu străin → nimic", () => {
    expect(extractRomimoLinks({}, "HB-1").offers).toEqual([]);
    const bad = extractRomimoLinks({ romimoUrl: "https://evil.com/x", publi24Url: "http://www.publi24.ro/x" }, "HB-1");
    expect(bad).toEqual({ publicUrl: null, offers: [] });
  });
});
