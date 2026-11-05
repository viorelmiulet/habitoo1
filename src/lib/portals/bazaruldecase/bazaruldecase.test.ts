/** BazarulDeCase.ro: feed XML Kyero v3 + index. Totul simulat; nicio cerere externă. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const KEY = "test-bazaruldecase-index-key-0123456";
process.env["BAZARULDECASE_INDEX_KEY"] = KEY;
process.env["IMOVE_INDEX_KEY"] = "test-imove-index-key-independent-0123";
const ORG = "04041622-b3d2-4cbe-a2aa-000000000001";
const indexed = new Map<string, "active" | "grace">();
const built: string[] = [];

vi.mock("@/integrations/supabase/client.server", () => {
  const api: Record<string, unknown> = {};
  Object.assign(api, {
    from: () => api, select: () => api, eq: () => api, in: () => api, is: () => api, insert: () => api,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: ORG }], error: null }).then(r),
  });
  return { supabaseAdmin: api };
});
vi.mock("@/lib/portals/clickimob/index-feed.server", async () => {
  const { properstarEntityId } = await import("@/lib/portals/properstar/mapper");
  return {
    listClickimobIndexedAgencies: async () => [],
    listPortalIndexedAgencies: async (_n: Date, p: string) => (p === "bazaruldecase" ? [...indexed] : []).map(([o, status]) => ({ id: properstarEntityId("hb", o), status })),
  };
});
vi.mock("@/lib/portals/bazaruldecase/feed.server", async () => {
  const { kyeroDocument, kyeroProperties } = await import("./kyero");
  return {
    buildBazarulKyeroFeed: async (i: { organizationId: string }) => {
      built.push(i.organizationId);
      const r = kyeroProperties({ property: prop(), images: [], agent: null, coords: null });
      return { xml: kyeroDocument(r.xml), properties: r.xml.length, offers: 1, warnings: [] };
    },
  };
});

const { kyeroProperties, kyeroDocument, kyeroType, xmlEscape, KYERO_TYPES } = await import("./kyero");
const { checkKyeroXml } = await import("./check");
const { clickimobFeedToken } = await import("@/lib/portals/clickimob/index-feed");
const { properstarEntityId } = await import("@/lib/portals/properstar/mapper");
const { Route } = await import("@/routes/api/public/portal/v1/bazaruldecase.feed[.]xml");
const { Route: ImoveRoute } = await import("@/routes/api/public/portal/v1/imove.feed");
const idx = await vi.importActual<typeof import("@/lib/portals/clickimob/index-feed.server")>("@/lib/portals/clickimob/index-feed.server");

function prop(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-4333-8444-555555555555", updated_at: "2026-07-01T09:30:05Z", reference: "HB-1001", property_type: "apartment",
    transaction_kind: "sale", for_sale: true, for_rent: false, price: 120000, sale_price: 120000.4, rent_price: null,
    currency: "EUR", sale_currency: "EUR", rent_currency: null, construction_stage: "În construcție",
    city: "Bucureşti Sectorul 6", county: "Bucuresti", district: "Drumul Taberei", lat: 44.4, lng: 26.1,
    bedrooms: null, rooms: 2, bathrooms: 1, usable_surface: 54.6, surface: 60, land_surface: null, energy_class: "A+",
    description: "Ap. <b>frumos</b> & luminos\n\"cu\" 'vedere' > parc < 5 min", features: ["Piscină", "Aer condiționat!"],
    ...over,
  } as Parameters<typeof kyeroProperties>[0]["property"];
}
const parse = (xml: string) => new XMLParser({ ignoreAttributes: false, numberParseOptions: { leadingZeros: false, hex: false }, isArray: (n) => n === "property" }).parse(xml).root;
const call = (route: typeof Route, url: string) =>
  (route.options.server!.handlers as { GET: (c: { request: Request }) => Promise<Response> }).GET({ request: new Request(url) });
const tok = (org = ORG, portal: "bazaruldecase" | "imove" = "bazaruldecase", key = KEY) => clickimobFeedToken(properstarEntityId("hb", org), key, portal);

beforeEach(() => { indexed.clear(); built.length = 0; });

describe("XML Kyero v3", () => {
  const xml = kyeroDocument(kyeroProperties({ property: prop(), images: ["https://crm.habitoo.ro/api/public/sites/v1/media/a"], agent: { email: "ana@ag.ro", phone: "0722 123 456" }, coords: { lat: 44.4, lng: 26.1 } }).xml);

  it("e bine format și are structura cerută", () => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).not.toContain("CDATA");
    const p = parse(xml).property[0];
    expect(parse(xml).kyero.feed_version).toBe(3);
    expect(p).toMatchObject({ id: "11111111-2222-4333-8444-555555555555-sale", date: "2026-07-01 12:30:05", ref: "HB-1001", price: 120000, currency: "EUR", price_freq: "sale", new_build: 1, type: "Apartment", town: "București", province: "București", country: "Romania", location_detail: "Drumul Taberei", beds: 2, pool: 1, notes: "Habitoo HB-1001", email: "ana@ag.ro", contact_number: "0040722123456" });
    expect(xml).toContain("<contact_number>0040722123456</contact_number>");
    expect(p.energy_rating).toEqual({ consumption: "A", emissions: "X" });
    expect(p.surface_area.built).toBe(55);
    expect(p.images.image["@_id"]).toBe("1");
    expect(p.features.feature).toContain("Aer condiționat");
  });

  it("escapează & < > \" ' și pune &#13; la rânduri noi, fără HTML", () => {
    expect(xmlEscape(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
    expect(xml).toContain("Ap. frumos &amp; luminos&#13;&quot;cu&quot; &apos;vedere&apos; &gt; parc &lt; 5 min");
    expect(xml).not.toContain("<b>");
    expect(parse(xml).property[0].desc.ro).toBe(parse(xml).property[0].desc.en);
  });

  it("vânzare + închiriere → două <property> cu id-uri diferite", () => {
    const r = kyeroProperties({ property: prop({ for_rent: true, rent_price: 600, rent_currency: "EUR" }), images: [], agent: null, coords: null });
    const props = parse(kyeroDocument(r.xml)).property;
    expect(props).toHaveLength(2);
    expect(props.map((p: { id: string }) => p.id)).toEqual(["11111111-2222-4333-8444-555555555555-sale", "11111111-2222-4333-8444-555555555555-rent"]);
    expect(props[1].price_freq).toBe("month");
    expect(checkKyeroXml(kyeroDocument(r.xml))).toMatchObject({ ok: true, properties: 2 });
  });

  it("mapare tipuri: explicit; fără corespondent → omis cu avertisment", () => {
    expect(Object.keys(KYERO_TYPES)).toHaveLength(11);
    expect(kyeroType("villa")).toBe("Villa");
    expect(kyeroType("garage")).toBe("Garage");
    const r = kyeroProperties({ property: prop({ property_type: "hotel" }), images: [], agent: null, coords: null });
    expect(r.xml).toEqual([]);
    expect(r.warnings[0]).toContain("hotel");
  });
});

describe("ruta feed.xml", () => {
  const url = (t: string) => `https://crm.habitoo.ro/api/public/portal/v1/bazaruldecase/feed.xml?token=${encodeURIComponent(t)}`;
  it("token valid → XML cu Content-Type application/xml", async () => {
    indexed.set(ORG, "active");
    const res = await call(Route, url(tok()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(parse(await res.text()).property).toHaveLength(1);
  });
  it("agenție în grație → <root> cu <kyero> și fără proprietăți", async () => {
    indexed.set(ORG, "grace");
    const body = await (await call(Route, url(tok()))).text();
    expect(parse(body).kyero.feed_version).toBe(3);
    expect(parse(body).property).toBeUndefined();
    expect(built).toEqual([]);
  });
  it("token invalid → același răspuns ca la iMove", async () => {
    indexed.set(ORG, "active");
    const bad = await call(Route, url(tok() + "0"));
    const imove = await call(ImoveRoute as unknown as typeof Route, `https://crm.habitoo.ro/api/public/portal/v1/imove/feed?token=${encodeURIComponent(tok(ORG, "imove", "x") + "0")}`);
    expect(bad.status).toBe(401);
    expect(bad.status).toBe(imove.status);
    expect(await bad.json()).toEqual(await imove.json());
    expect((await call(Route, url(tok(ORG, "imove", "test-imove-index-key-independent-0123")))).status).toBe(401);
  });
});

describe("indexul BazarulDeCase.ro", () => {
  it("fiecare agenție are feed JSON și kyero_xml_url absolut cu tokenul", async () => {
    const org = { id: ORG, status: "active", archived_at: null, name: "A", legal_name: null, cui: null, email: null, phone: null, city: null, logo_url: null, material_address: null, material_email: null, material_phone: null, material_website: null, updated_at: "2026-09-20T10:00:00Z" };
    const NOW = new Date("2026-10-01T09:00:00Z");
    const src = { orgs: [org], connections: [{ organization_id: ORG, activated: true, updated_at: null }], selectedOrgs: [ORG], states: [] };
    const deps = { indexKey: () => KEY, listAgencies: async () => idx.selectClickimobAgencies(src, NOW).agencies, log: vi.fn(async () => {}), rateLimited: () => false };
    const body = await (await idx.handlePortalIndex(new Request("https://crm.habitoo.ro/api/public/feed/bazaruldecase/index/k.json"), `${KEY}.json`, "bazaruldecase", deps, NOW)).json();
    expect(body.version).toBe("habitoo-bazaruldecase-index/1.0");
    const a = body.agencies[0];
    expect(a.feed.base_url).toMatch(/\/api\/public\/sites\/v1$/);
    expect(a.feed.token.startsWith("hbbc_")).toBe(true);
    expect(a.kyero_xml_url).toBe(`https://crm.habitoo.ro/api/public/portal/v1/bazaruldecase/feed.xml?token=${encodeURIComponent(a.feed.token)}`);
  });
});
