/**
 * Teste comportamentale pentru feedul Properstar: ce intră, ce e exclus, ce e
 * marcat retras și ce NU se scurge niciodată (adresa exactă, altă agenție).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  mapPropertyToProperstar,
  properstarStatusFor,
  sanitizeProperstarHtml,
  properstarPhone,
  properstarPhotoDateSuffix,
} from "./mapper";

/* ------------------------------ fixtures in-memory ------------------------------ */

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {
  portal_publications: [],
  properties: [],
  organizations: [],
  property_images: [],
  profiles: [],
};

function matches(row: Row, filters: { op: string; col: string; value: unknown }[]): boolean {
  return filters.every((f) => {
    const actual = row[f.col];
    if (f.op === "eq") return actual === f.value;
    if (f.op === "neq") return actual !== f.value;
    if (f.op === "is") return (actual ?? null) === f.value;
    if (f.op === "in") return (f.value as unknown[]).includes(actual);
    return true;
  });
}

function builder(table: string) {
  const filters: { op: string; col: string; value: unknown }[] = [];
  const result = () => ({ data: db[table]!.filter((r) => matches(r, filters)), error: null });
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, value: unknown) => (filters.push({ op: "eq", col, value }), api),
    neq: (col: string, value: unknown) => (filters.push({ op: "neq", col, value }), api),
    is: (col: string, value: unknown) => (filters.push({ op: "is", col, value }), api),
    in: (col: string, value: unknown) => (filters.push({ op: "in", col, value }), api),
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

const { buildProperstarFeed } = await import("./feed.server");

const ORG = "org-1";
const OTHER_ORG = "org-2";
const REQUEST_URL = "https://crm.habitoo.ro/api/public/feed/properstar/key.xml";

function seedProperty(overrides: Row = {}): Row {
  return {
    id: "prop-1",
    organization_id: ORG,
    reference: "HB-1001",
    title: "Apartament 2 camere",
    description: "Apartament luminos <script>alert(1)</script><b>renovat</b>",
    transaction_kind: "sale",
    property_type: "apartment",
    status: "available",
    publish_status: "published",
    deleted_at: null,
    price: 85000,
    currency: "EUR",
    city: "Timișoara",
    county: "Timiș",
    postal_code: "300001",
    street: "Strada Lungă",
    street_number: "12",
    address: "Strada Lungă 12",
    location_precise: true,
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    usable_surface: 54,
    land_surface: null,
    assigned_to: "agent-1",
    published_at: "2026-01-10T08:00:00.000Z",
    created_at: "2026-01-01T08:00:00.000Z",
    updated_at: "2026-02-01T08:00:00.000Z",
    ...overrides,
  };
}

function seedAll(publicationOverrides: Row = {}, propertyOverrides: Row = {}) {
  db.portal_publications = [
    {
      organization_id: ORG,
      property_id: "prop-1",
      portal_key: "properstar",
      enabled: true,
      withdrawn_at: null,
      updated_at: "2026-02-01T08:00:00.000Z",
      ...publicationOverrides,
    },
  ];
  db.properties = [seedProperty(propertyOverrides)];
  db.organizations = [
    {
      id: ORG,
      name: "Habitoo Imobiliare",
      email: "office@habitoo.ro",
      phone: "0722000111",
      city: "Timișoara",
      postal_code: "300001",
      logo_url: "https://cdn.habitoo.ro/logo.png",
      material_address: "Bd. Revoluției 5",
      material_email: "office@habitoo.ro",
      material_phone: "0722000111",
      material_website: "https://habitoo.ro",
    },
  ];
  db.profiles = [
    {
      id: "agent-1",
      full_name: "Ana Pop",
      email: "ana@habitoo.ro",
      phone: "0733111222",
      avatar_url: "https://cdn.habitoo.ro/ana.jpg",
    },
  ];
  db.property_images = [
    {
      id: "img-1",
      organization_id: ORG,
      property_id: "prop-1",
      storage_path: "prop-1/1.jpg",
      include_in_publish: true,
      is_confidential: false,
      sort_order: 1,
      updated_at: "2026-02-03T10:00:00.000Z",
    },
  ];
}

beforeEach(() => {
  seedAll();
});

const build = (over: Partial<Parameters<typeof buildProperstarFeed>[0]> = {}) =>
  buildProperstarFeed({ organizationId: ORG, requestUrl: REQUEST_URL, ...over });

describe("Properstar feed", () => {
  it("emite structura documentată, cu un Advert și blocul de contact", async () => {
    const result = await build();
    expect(result.adverts).toHaveLength(1);
    const xml = result.xml;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<Adverts>");
    expect(xml).toContain("<Advert>");
    for (const node of [
      "AdvertId",
      "Reference",
      "OriginalUrl",
      "AdvertType",
      "SubType",
      "PublicationDate",
      "Price",
      "PriceCurrency",
      "ShowPrice",
      "City",
      "PostalCode",
      "Country",
      "ShowAddress",
      "Status",
      "Contact",
      "OfficeId",
      "AgentId",
      "AgentEmail",
    ]) {
      expect(xml).toContain(`<${node}>`);
    }
    expect(xml).toContain("<Country>RO</Country>");
    expect(xml).toContain("<Status>Active</Status>");
    expect(xml).toContain('<Description Language="ro">');
    expect(xml).toContain("<AgentEmail>ana@habitoo.ro</AgentEmail>");
    // Telefoanele plecă în format internațional.
    expect(xml).toContain("+40733111222");
  });

  it("nu publică HTML nepermis și învelește textul liber în CDATA", async () => {
    const { xml } = await build();
    expect(xml).toContain("<![CDATA[");
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("<b>renovat</b>");
  });

  it("exclude oferta fără câmp obligatoriu și o raportează cu ce lipsește", async () => {
    seedAll({}, { postal_code: null, city: null });
    const result = await build();
    expect(result.adverts).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.missing.join(" ")).toMatch(/Localitate/i);
    expect(result.xml).not.toContain("<Advert>");
  });

  it("pune sufixul de dată pe fiecare fotografie", async () => {
    const { xml } = await build();
    expect(xml).toMatch(/\?date=03\/02\/2026/);
  });

  it("ține oferta retrasă 7 zile ca Deleted, apoi dispare", async () => {
    seedAll({ enabled: false, withdrawn_at: "2026-02-01T08:00:00.000Z" });
    const fresh = await build({ now: new Date("2026-02-05T08:00:00.000Z") });
    expect(fresh.xml).toContain("<Status>Deleted</Status>");
    expect(fresh.deleted).toBe(1);

    const old = await build({ now: new Date("2026-02-20T08:00:00.000Z") });
    expect(old.adverts).toHaveLength(0);
    expect(old.xml).not.toContain("<Advert>");
  });

  it("ascunde strada când locația precisă nu e permisă, dar trimite oraș și cod poștal", async () => {
    seedAll({}, { location_precise: false });
    const { xml } = await build();
    expect(xml).not.toContain("Strada Lungă");
    expect(xml).toContain("<City>Timișoara</City>");
    expect(xml).toContain("<PostalCode>300001</PostalCode>");
    expect(xml).toContain("<ShowAddress>false</ShowAddress>");
  });

  it("conține doar ofertele bifate pentru Properstar", async () => {
    seedAll();
    db.portal_publications = [
      { ...db.portal_publications[0]!, enabled: true },
      {
        organization_id: ORG,
        property_id: "prop-2",
        portal_key: "imobiliare",
        enabled: true,
        withdrawn_at: null,
        updated_at: "2026-02-01T08:00:00.000Z",
      },
    ];
    db.properties = [seedProperty(), seedProperty({ id: "prop-2", reference: "HB-1002" })];
    const result = await build();
    expect(result.adverts.map((a) => a.reference)).toEqual(["HB-1001"]);
  });

  it("nu scurge ofertele altei agenții", async () => {
    seedAll();
    db.portal_publications.push({
      organization_id: OTHER_ORG,
      property_id: "prop-9",
      portal_key: "properstar",
      enabled: true,
      withdrawn_at: null,
      updated_at: "2026-02-01T08:00:00.000Z",
    });
    db.properties.push(
      seedProperty({ id: "prop-9", organization_id: OTHER_ORG, reference: "X-1" }),
    );
    const result = await build();
    expect(result.adverts.map((a) => a.reference)).toEqual(["HB-1001"]);
  });
});

describe("helperi Properstar", () => {
  it("marchează starea în funcție de vechimea retragerii", () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    expect(properstarStatusFor({ withdrawn: false, referenceDate: null, now })).toBe("Active");
    expect(
      properstarStatusFor({ withdrawn: true, referenceDate: "2026-02-08T00:00:00.000Z", now }),
    ).toBe("Deleted");
    expect(
      properstarStatusFor({ withdrawn: true, referenceDate: "2026-01-01T00:00:00.000Z", now }),
    ).toBe("omit");
  });

  it("păstrează doar etichetele permise", () => {
    expect(sanitizeProperstarHtml("<p>ok</p><div>x</div><ul><li>a</li></ul>")).toBe(
      "<p>ok</p>x<ul><li>a</li></ul>",
    );
  });

  it("normalizează telefonul la +40", () => {
    expect(properstarPhone("0722 000 111")).toBe("+40722000111");
    expect(properstarPhone("+40722000111")).toBe("+40722000111");
  });

  it("formatează sufixul de dată ca dd/mm/yyyy", () => {
    expect(properstarPhotoDateSuffix("2026-02-03T10:00:00.000Z")).toBe("?date=03/02/2026");
  });

  it("nu emite niciodată un advert cu noduri obligatorii goale", () => {
    const result = mapPropertyToProperstar(
      seedProperty({ transaction_kind: null, description: "" }) as never,
      {
        baseUrl: "https://crm.habitoo.ro",
        publicSiteUrl: "https://www.habitoo.ro",
        images: [],
        office: {
          officeId: ORG,
          officeName: "Habitoo",
          email: "a@b.ro",
          phone: "+40722000111",
          website: null,
          address: null,
          postalCode: "300001",
          city: "Timișoara",
          logo: null,
        },
        agent: {
          agentId: "agent-1",
          firstName: "Ana",
          lastName: "Pop",
          email: "ana@habitoo.ro",
          mobilePhone: "+40733111222",
          landPhone: null,
          photo: null,
        },
        status: "Active",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing.length).toBeGreaterThan(0);
  });
});
