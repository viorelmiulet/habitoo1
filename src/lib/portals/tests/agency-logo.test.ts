import { describe, expect, it, vi } from "vitest";
import { pickAgencyLogoUrl, signAgencyLogos } from "../agency-logo";
import { selectClickimobAgencies } from "../clickimob/index-feed.server";

const signed = new Map([["org/logo.png", "https://cdn.test/sign/agency-logos/org/logo.png?token=x"]]);

describe("logo-ul agenției pe portaluri", () => {
  it("folosește logo-ul încărcat (logo_path) înaintea lui logo_url", () => {
    expect(pickAgencyLogoUrl({ logo_path: "org/logo.png", logo_url: "https://vechi.ro/l.png" }, signed)).toBe(
      "https://cdn.test/sign/agency-logos/org/logo.png?token=x",
    );
  });
  it("logo_url rămâne rezervă când nu există fișier sau semnarea a eșuat", () => {
    expect(pickAgencyLogoUrl({ logo_path: null, logo_url: "https://vechi.ro/l.png" }, signed)).toBe("https://vechi.ro/l.png");
    expect(pickAgencyLogoUrl({ logo_path: "lipsa.png", logo_url: "https://vechi.ro/l.png" }, signed)).toBe("https://vechi.ro/l.png");
  });
  it("acceptă doar https", () => {
    expect(pickAgencyLogoUrl({ logo_path: null, logo_url: "http://x.ro/l.png" }, signed)).toBeNull();
    expect(pickAgencyLogoUrl({}, signed)).toBeNull();
  });
  it("semnează toate logo-urile într-o singură cerere", async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}` })),
      error: null,
    }));
    const db = { storage: { from: () => ({ createSignedUrls }) } };
    const map = await signAgencyLogos(db, ["a.png", "a.png", null, "b.png"]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(map.get("b.png")).toBe("https://s/b.png");
  });
  it("indexul ClickImob publică URL-ul ales", () => {
    const { agencies } = selectClickimobAgencies(
      {
        orgs: [
          {
            id: "00000000-0000-0000-0000-000000000001", status: "active", archived_at: null, name: "A",
            legal_name: null, cui: null, email: null, phone: null, city: null,
            logo_url: pickAgencyLogoUrl({ logo_path: "org/logo.png", logo_url: null }, signed),
            material_address: null, material_email: null, material_phone: null, material_website: null,
            updated_at: "2026-09-29T00:00:00Z",
          },
        ],
        connections: [{ organization_id: "00000000-0000-0000-0000-000000000001", activated: true, updated_at: "2026-09-29T00:00:00Z" }],
        selectedOrgs: ["00000000-0000-0000-0000-000000000001"],
        states: [],
      } as never,
      new Date("2026-09-29T12:00:00Z"),
    );
    expect(agencies[0]?.logo_url).toContain("https://cdn.test/sign/agency-logos/org/logo.png");
  });
});
