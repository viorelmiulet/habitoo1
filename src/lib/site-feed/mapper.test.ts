import { describe, expect, it } from "vitest";
import {
  buildPaginatedFeed,
  isImageFeedEligible,
  isPropertyFeedEligible,
  mapPropertyToFeed,
  parsePagination,
  isVisitDateAcceptable,
  FEED_MAX_PER_PAGE,
  type PropertyImageRow,
  type PropertyRow,
} from "./mapper";

const baseProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org",
  reference: "RF-1001",
  external_id: null,
  title: "Apartament 3 camere",
  description: "Descriere",
  property_type: "apartment",
  category: null,
  transaction_kind: "sale",
  status: "active",
  price: 165000,
  currency: "EUR",
  negotiable: true,
  surface: 82,
  usable_surface: 78,
  built_surface: 90,
  land_surface: null,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 2,
  floor: 3,
  building_floors: 8,
  build_year: 2019,
  layout: "decomandat",
  furnishing: "Nemobilat",
  heating: "Centrală proprie",
  parking: "Subteran",
  balcony: true,
  features: ["Balcon"],
  utilities: ["Apă"],
  address: "Str. Exemplu 12",
  city: "București",
  county: "București",
  district: "Sector 1",
  street: null,
  street_number: null,
  lat: 44.48,
  lng: 26.09,
  location_precise: true,
  owner_contact_id: null,
  assigned_to: "22222222-2222-4222-8222-222222222222",
  source: "Proprietar",
  commission: "2%",
  vat_included: true,
  internal_notes: "NOTĂ INTERNĂ",
  collaboration: false,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  created_by: null,
  updated_by: null,
  tags: ["top", "portal:clickimob"],
  publish_status: "published",
  published_at: "2026-01-02T00:00:00Z",
  last_activity_at: null,
  county_siruta_code: null,
  uat_siruta_code: null,
  locality_siruta_code: null,
} as unknown as PropertyRow;

const image = {
  id: "33333333-3333-4333-8333-333333333333",
  organization_id: "org",
  property_id: baseProperty.id,
  url: "https://internal.example/x.jpg",
  storage_path: "org/prop/x.jpg",
  position: 0,
  is_primary: true,
  is_confidential: false,
  include_in_publish: true,
  alt: "Living",
  width: 1920,
  height: 1080,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
  created_by: null,
  updated_by: null,
} as unknown as PropertyImageRow;

describe("eligibilitate feed", () => {
  it("acceptă doar proprietăți publicate, nearhivate, cu status public", () => {
    expect(isPropertyFeedEligible(baseProperty)).toBe(true);
    expect(isPropertyFeedEligible({ ...baseProperty, publish_status: "draft" })).toBe(false);
    expect(isPropertyFeedEligible({ ...baseProperty, deleted_at: "2026-01-01" })).toBe(false);
    expect(isPropertyFeedEligible({ ...baseProperty, status: "sold" } as PropertyRow)).toBe(false);
  });

  it("exclude imaginile confidențiale sau nepublicabile", () => {
    expect(isImageFeedEligible(image)).toBe(true);
    expect(isImageFeedEligible({ ...image, is_confidential: true })).toBe(false);
    expect(isImageFeedEligible({ ...image, include_in_publish: false })).toBe(false);
  });
});

describe("mapPropertyToFeed", () => {
  const mapped = mapPropertyToFeed(baseProperty, {
    baseUrl: "https://crm.habitoo.ro",
    publicSiteUrl: "https://habitoo.ro",
    images: [
      image,
      { ...image, id: "44444444-4444-4444-8444-444444444444", is_confidential: true },
    ],
    agent: { id: "22222222-2222-4222-8222-222222222222", full_name: "Mihai Popescu" },
    portalKeys: ["clickimob"],
  });

  it("expune portalurile o singură dată din publicări + taguri legacy", () => {
    expect(mapped.portals).toEqual(["clickimob"]);
  });

  it("nu inventează câmpuri fără echivalent și păstrează cele reale", () => {
    expect(mapped.pretfaratva).toBeNull();
    expect(mapped.comisioncumparator).toBeNull();
    expect(mapped.tvainclus).toBe(true);
    expect(mapped.nrdormitoare).toBe(2);
    expect(mapped.cod_siruta_localitate).toBeNull();
  });

  it("linkul public al ofertei rămâne pe site, nu pe CRM", () => {
    expect(mapped.url).toBe(`https://habitoo.ro/oferta/${baseProperty.id}`);
    expect(mapped.images[0]?.src).toBe(
      "https://crm.habitoo.ro/api/public/sites/v1/media/33333333-3333-4333-8333-333333333333",
    );
  });

  it("mapează identificatorii și datele", () => {
    expect(mapped.idnum).toBe(1001);
    expect(mapped.idstr).toBe("RF-1001");
    expect(mapped.alias).toBe(`oferta-${baseProperty.id}`);
    expect(mapped.dataadaugare).toBe("2026-01-01T00:00:00Z");
    expect(mapped.datamodificare).toBe("2026-02-01T00:00:00Z");
    expect(mapped.agent).toBe("Mihai Popescu");
    expect(mapped.url).toBe(`https://habitoo.ro/oferta/${baseProperty.id}`);
  });

  it("separă vânzarea de închiriere", () => {
    expect(mapped.devanzare).toBe(true);
    expect(mapped.pretvanzare).toBe(165000);
    expect(mapped.pretinchiriere).toBeNull();
    expect(mapped.monedavanzare).toBe("EUR");
    const rent = mapPropertyToFeed(
      { ...baseProperty, transaction_kind: "rent", price: 450 } as PropertyRow,
      {
        baseUrl: "https://crm.habitoo.ro",
      },
    );
    expect(rent.deinchiriere).toBe(true);
    expect(rent.pretinchiriere).toBe(450);
    expect(rent.pretvanzare).toBeNull();
  });

  it("trimite ambele seturi de preț când proprietatea e și de vânzare și de închiriere", () => {
    const both = mapPropertyToFeed(
      {
        ...baseProperty,
        transaction_kind: "sale",
        for_sale: true,
        for_rent: true,
        sale_price: 165000,
        sale_currency: "EUR",
        rent_price: 900,
        rent_currency: "EUR",
        status: "reserved",
      } as PropertyRow,
      { baseUrl: "https://crm.habitoo.ro" },
    );
    expect(both.devanzare).toBe(true);
    expect(both.deinchiriere).toBe(true);
    expect(both.pretvanzare).toBe(165000);
    expect(both.monedavanzare).toBe("EUR");
    expect(both.pretinchiriere).toBe(900);
    expect(both.monedainchiriere).toBe("EUR");
    // Statusul nu depinde de tipul de tranzacție.
    expect(both.status).toBe("reserved");
  });

  it("doar închiriere → nu expune preț de vânzare", () => {
    const rentOnly = mapPropertyToFeed(
      {
        ...baseProperty,
        transaction_kind: "rent",
        for_sale: false,
        for_rent: true,
        sale_price: null,
        rent_price: 700,
        rent_currency: "RON",
      } as PropertyRow,
      { baseUrl: "https://crm.habitoo.ro" },
    );
    expect(rentOnly.devanzare).toBe(false);
    expect(rentOnly.pretvanzare).toBeNull();
    expect(rentOnly.monedavanzare).toBeNull();
    expect(rentOnly.pretinchiriere).toBe(700);
    expect(rentOnly.monedainchiriere).toBe("RON");
  });

  it("nu inventează valori pentru câmpurile inexistente", () => {
    expect(mapped.nrbucatarii).toBeNull();
    expect(mapped.confort).toBeNull();
    expect(mapped.energy).toEqual({ clasa: null, consum: null, emisii: null });
    expect(mapped.vecinatati).toEqual([]);
  });

  it("expune imaginile prin URL public de proxy, fără URL-uri interne", () => {
    expect(mapped.images).toHaveLength(1);
    expect(mapped.images[0]!.src).toBe(
      `https://crm.habitoo.ro/api/public/sites/v1/media/${image.id}`,
    );
    expect(mapped.images[0]!.tip).toBe("principala");
    expect(mapped.images[0]!.pozitie).toBe(0);
    expect(mapped.images[0]!.modificata).toBe("2026-01-05T00:00:00Z");
    expect(JSON.stringify(mapped)).not.toContain("internal.example");
  });

  it("nu expune date CRM sensibile", () => {
    const json = JSON.stringify(mapped);
    expect(json).not.toContain("NOTĂ INTERNĂ");
    expect(json).not.toContain("owner_contact_id");
  });

  it("citește portalurile și flagurile din tags", () => {
    expect(mapped.portals).toEqual(["clickimob"]);
    expect(mapped.top).toBe(true);
    expect(mapped.pole).toBe(false);
  });
});

describe("paginare", () => {
  it("limitează per_page", () => {
    const url = new URL(
      "https://crm.habitoo.ro/api/public/sites/v1/properties?page=2&per_page=9999",
    );
    expect(parsePagination(url)).toEqual({ page: 2, perPage: FEED_MAX_PER_PAGE });
  });

  it("construiește metadatele de listă", () => {
    const url = new URL("https://crm.habitoo.ro/api/public/sites/v1/properties");
    const feed = buildPaginatedFeed({
      data: [1, 2],
      total: 5,
      page: 2,
      perPage: 2,
      requestUrl: url,
    });
    expect(feed).toMatchObject({
      total: 5,
      per_page: 2,
      current_page: 2,
      last_page: 3,
      from: 3,
      to: 4,
    });
    expect(feed.next_page_url).toContain("page=3");
    expect(feed.prev_page_url).toContain("page=1");
  });

  it("tratează feedul gol", () => {
    const url = new URL("https://crm.habitoo.ro/api/public/sites/v1/properties");
    const feed = buildPaginatedFeed({ data: [], total: 0, page: 1, perPage: 50, requestUrl: url });
    expect(feed).toMatchObject({
      total: 0,
      last_page: 1,
      from: null,
      to: null,
      next_page_url: null,
    });
  });
});

describe("mapper — câmpuri fără echivalent real în schemă", () => {
  it("nu publică preț fără TVA derivat și nici comisionul intern", () => {
    const mapped = mapPropertyToFeed(
      { ...(baseProperty as PropertyRow), vat_included: false, commission: "2%" },
      { baseUrl: "https://crm.habitoo.ro", publicSiteUrl: "https://habitoo.ro" },
    );
    expect(mapped.pretfaratva).toBeNull();
    expect(mapped.comisioncumparator).toBeNull();
  });

  it("folosește domeniile canonice pentru media și ofertă", () => {
    const mapped = mapPropertyToFeed(baseProperty as PropertyRow, {
      baseUrl: "https://crm.habitoo.ro",
      publicSiteUrl: "https://habitoo.ro",
    });
    expect(mapped.url).toBe(`https://habitoo.ro/oferta/${baseProperty.id}`);
  });
});

describe("isVisitDateAcceptable", () => {
  const now = new Date("2026-09-06T10:00:00.000Z");
  it("respinge date imposibile care trec regexul", () => {
    expect(isVisitDateAcceptable("2026-99-99", now)).toBe(false);
    expect(isVisitDateAcceptable("2026-02-31", now)).toBe(false);
    expect(isVisitDateAcceptable("azi", now)).toBe(false);
  });
  it("acceptă doar date rezonabile", () => {
    expect(isVisitDateAcceptable("2026-09-06", now)).toBe(true);
    expect(isVisitDateAcceptable("2026-09-05", now)).toBe(true);
    expect(isVisitDateAcceptable("2030-01-01", now)).toBe(false);
    expect(isVisitDateAcceptable("2000-01-01", now)).toBe(false);
  });
});

describe("pagination edge cases", () => {
  const url = new URL("https://crm.habitoo.ro/api/public/sites/v1/properties");
  const parse = (qs: string) => parsePagination(new URL(`${url}?${qs}`));
  it("normalizează valori invalide", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-5").page).toBe(1);
    expect(parse("page=abc").page).toBe(1);
    expect(parse("per_page=0").perPage).toBe(50);
    expect(parse("per_page=-10").perPage).toBe(50);
    expect(parse("per_page=99999").perPage).toBe(FEED_MAX_PER_PAGE);
  });
  it("pagina peste last_page returnează listă goală cu metadata consistentă", () => {
    const feed = buildPaginatedFeed({ data: [], total: 3, page: 99, perPage: 50, requestUrl: url });
    expect(feed.data).toEqual([]);
    expect(feed.last_page).toBe(1);
    expect(feed.next_page_url).toBeNull();
    expect(feed.total).toBe(3);
  });
});
