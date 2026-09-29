import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
// Ofertele de test sunt minimale: serializarea reală e testată în properstar-feed.test.ts.
vi.mock("./mapper", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mapper")>()),
  buildProperstarXml: (ads: { advertId: string; status: string }[]) =>
    `<?xml version="1.0" encoding="UTF-8"?><Adverts>${ads
      .map((a) => `<Advert><AdvertId>${a.advertId}</AdvertId><Status>${a.status}</Status></Advert>`)
      .join("")}</Adverts>`,
}));

import {
  handleProperstarIndex,
  handleProperstarSignedFeed,
  type IndexDeps,
  type IndexedAgency,
} from "./index-feed.server";
import {
  indexPresence,
  isProperstarActive,
  nextIndexState,
  signOfficeId,
} from "./index-feed";
import { buildProperstarXml, type ProperstarAdvert } from "./mapper";
import type { ProperstarFeedBuild } from "./feed.server";

const KEY = "test-index-key-0123456789";
const NOW = new Date("2026-09-27T09:00:00Z");

function advert(id: string): ProperstarAdvert {
  return { advertId: id, status: "Active" } as unknown as ProperstarAdvert;
}

function build(adverts: ProperstarAdvert[]): ProperstarFeedBuild {
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?><Adverts>${adverts
      .map((a) => `<Advert><AdvertId>${a.advertId}</AdvertId><Status>${a.status}</Status></Advert>`)
      .join("")}</Adverts>`,
    adverts,
    selected: adverts.length,
    active: adverts.length,
    deleted: 0,
    excluded: [],
    agencyPostalUsed: [],
    capped: false,
    lastModified: adverts.length ? "2026-09-26T10:11:12.000Z" : null,
  };
}

function deps(agencies: IndexedAgency[], feeds: Record<string, ProperstarFeedBuild>): IndexDeps {
  return {
    indexKey: () => KEY,
    listAgencies: async () => agencies,
    buildFeed: async (orgId) => feeds[orgId] ?? build([]),
    log: vi.fn(async () => {}),
    rateLimited: () => false,
  };
}

const A: IndexedAgency = { organizationId: "org-a", officeId: "hbA", officeName: "Agenția A & Co", presence: "active" };
const req = (path: string) => new Request(`http://localhost:8080${path}`);

describe("indexul Properstar", () => {
  it("cheie corectă → 200 și XML cu feed în formatul Properstar", async () => {
    const d = deps([A], { "org-a": build([advert("HB-1")]) });
    const res = await handleProperstarIndex(req(`/x/${KEY}.xml`), `${KEY}.xml`, d, NOW);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>/);
    expect(xml).toContain(
      `<feed id="hbA" name="Agenția A &amp; Co" url="http://localhost:8080/api/public/feed/properstar/agency/hbA.xml?sig=${signOfficeId("hbA", KEY)}"/>`,
    );
    expect(xml).not.toContain("<OfficeId>");
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ status: 200, endpoint: "portal.properstar.index" }));
  });

  it("cheie greșită → 401 fără conținut", async () => {
    const d = deps([A], { "org-a": build([advert("HB-1")]) });
    const res = await handleProperstarIndex(req("/x/gresit.xml"), "gresit.xml", d, NOW);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it("agenție activă fără oferte → absentă", async () => {
    const res = await handleProperstarIndex(req("/x"), KEY, deps([A], {}), NOW);
    expect(await res.text()).not.toContain("<Feed>");
  });

  it("limita de cereri se aplică și se jurnalizează", async () => {
    const d = { ...deps([A], {}), rateLimited: () => true };
    const res = await handleProperstarIndex(req("/x"), KEY, d, NOW);
    expect(res.status).toBe(429);
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));
  });
});

describe("criteriul de activare", () => {
  it("fără Properstar activat sau agenție blocată → inactivă, fără stare → absentă", () => {
    expect(isProperstarActive({ status: "active", archived_at: null }, null)).toBe(false);
    expect(isProperstarActive({ status: "active", archived_at: null }, { activated: false })).toBe(false);
    expect(isProperstarActive({ status: "suspended", archived_at: null }, { activated: true })).toBe(false);
    expect(isProperstarActive({ status: "active", archived_at: "2026-01-01" }, { activated: true })).toBe(false);
    expect(isProperstarActive({ status: "trial", archived_at: null }, { activated: true })).toBe(true);
    expect(indexPresence(nextIndexState(null, false, NOW), NOW)).toBe("gone");
  });

  it("agenție dezactivată → grație 7 zile, apoi absentă", () => {
    const active = nextIndexState(null, true, new Date("2026-09-20T00:00:00Z"));
    const off = nextIndexState(active, false, new Date("2026-09-21T00:00:00Z"));
    expect(off?.inactive_since).toBe("2026-09-21T00:00:00.000Z");
    expect(indexPresence(off, new Date("2026-09-27T23:00:00Z"))).toBe("grace");
    const later = nextIndexState(off, false, new Date("2026-09-29T00:00:00Z"));
    expect(later?.inactive_since).toBe(off?.inactive_since);
    expect(indexPresence(later, new Date("2026-09-29T00:00:00Z"))).toBe("gone");
  });
});

describe("feedul semnat al agenției", () => {
  const url = (sig: string) => req(`/api/public/feed/properstar/agency/hbA.xml?sig=${sig}`);

  it("semnătură greșită → 401", async () => {
    const res = await handleProperstarSignedFeed(url("0".repeat(64)), "hbA.xml", deps([A], {}), NOW);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
  });

  it("conținut identic cu buildProperstarFeed", async () => {
    const b = build([advert("HB-1"), advert("HB-2")]);
    const res = await handleProperstarSignedFeed(url(signOfficeId("hbA", KEY)), "hbA.xml", deps([A], { "org-a": b }), NOW);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(b.xml);
  });

  it("agenție în grație → toate ofertele Deleted", async () => {
    const b = build([advert("HB-1"), advert("HB-2")]);
    const d = deps([{ ...A, presence: "grace" }], { "org-a": b });
    const xml = await (await handleProperstarSignedFeed(url(signOfficeId("hbA", KEY)), "hbA.xml", d, NOW)).text();
    expect(xml).toBe(buildProperstarXml(b.adverts.map((a) => ({ ...a, status: "Deleted" as const }))));
    expect(xml.match(/<Status>Deleted<\/Status>/g)).toHaveLength(2);
    expect(xml).not.toContain("<Status>Active</Status>");
  });

  it("agenție ieșită din index → 404", async () => {
    const res = await handleProperstarSignedFeed(url(signOfficeId("hbA", KEY)), "hbA.xml", deps([], {}), NOW);
    expect(res.status).toBe(404);
  });
});
