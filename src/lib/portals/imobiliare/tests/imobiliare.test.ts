/**
 * Teste pentru integrarea Imobiliare.ro: credențiale/token, nomenclator de
 * locații, taxonomie, eligibilitate, categorii, loturi de imagini.
 */
import { describe, expect, it } from "vitest";
import {
  encodeImobiliareTokens,
  expiresAtFrom,
  needsImobiliareRefresh,
  parseImobiliareCredential,
  tokensFromResponse,
} from "../auth";
import { imobiliareCustomReference, isValidCustomReference } from "../config";
import { describeImobiliareValidation, classifyImobiliareStatus } from "../http";
import {
  denormalizeLocations,
  matchImobiliareLocation,
  parseImobiliareLocations,
} from "../locations";
import { buildImobiliareListing, hasRealCoordinates } from "../mapper";
import { categoryApiFor, parseCategories } from "../categories.server";
import { parseAgents, agentIdFromCreate } from "../agents.server";
import { batchEncodedImages } from "../media.server";

/* --------------------------------- tokenuri -------------------------------- */

describe("credențiale Imobiliare.ro", () => {
  it("tratează textul simplu ca parolă și JSON-ul ca pachet de tokenuri", () => {
    expect(parseImobiliareCredential("parola-mea")).toEqual({
      kind: "password",
      password: "parola-mea",
    });
    const encoded = encodeImobiliareTokens({
      username: "agentie",
      accessToken: "acc",
      refreshToken: "ref",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parseImobiliareCredential(encoded)).toEqual({
      kind: "tokens",
      username: "agentie",
      accessToken: "acc",
      refreshToken: "ref",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parseImobiliareCredential("")).toBeNull();
  });

  it("reînnoiește doar când mai sunt sub 3 zile de valabilitate", () => {
    const now = Date.UTC(2026, 0, 10);
    const base = { kind: "tokens", username: null, accessToken: "a", refreshToken: "r" } as const;
    expect(
      needsImobiliareRefresh(
        { ...base, expiresAt: new Date(now + 10 * 86_400_000).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(
      needsImobiliareRefresh(
        { ...base, expiresAt: new Date(now + 2 * 86_400_000).toISOString() },
        now,
      ),
    ).toBe(true);
    expect(needsImobiliareRefresh({ ...base, expiresAt: null }, now)).toBe(true);
  });

  it("extrage tokenurile din răspuns și păstrează refresh-ul anterior", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(tokensFromResponse({ data: { access_token: "A", expires_in: 60 } }, "old", now)).toEqual({
      accessToken: "A",
      refreshToken: "old",
      expiresAt: new Date(now + 60_000).toISOString(),
    });
    expect(tokensFromResponse({ nope: true }, null, now)).toBeNull();
    expect(expiresAtFrom(undefined, now)).toBe(new Date(now + 2_678_400_000).toISOString());
  });
});

/* ------------------------------- referințe -------------------------------- */

describe("custom_reference", () => {
  it("respectă formatul strict cerut de portal", () => {
    expect(isValidCustomReference(imobiliareCustomReference("HB-1006", "abc"))).toBe(true);
    expect(isValidCustomReference(imobiliareCustomReference("  HB 10/06 ", "abc"))).toBe(true);
    expect(isValidCustomReference(imobiliareCustomReference(null, "1564cc61-17be-4"))).toBe(true);
    expect(isValidCustomReference("-nu-incepe-bine")).toBe(false);
  });
});

/* --------------------------------- erori ---------------------------------- */

describe("clasificarea răspunsurilor", () => {
  it("401 cere reautorizare, 400 se oprește, 5xx se reia", () => {
    expect(classifyImobiliareStatus({ status: 401, attempt: 1 }).action).toBe("reauth");
    expect(classifyImobiliareStatus({ status: 400, attempt: 1 }).action).toBe("stop");
    expect(classifyImobiliareStatus({ status: 500, attempt: 1 }).action).toBe("retry_same");
    expect(classifyImobiliareStatus({ status: 500, attempt: 3 }).action).toBe("stop");
    expect(classifyImobiliareStatus({ status: 201, attempt: 1 }).action).toBe("ok");
  });

  it("extrage câmpurile respinse din răspunsul de validare", () => {
    expect(describeImobiliareValidation({ errors: { title: ["prea lung"] } })).toContain("title");
    expect(describeImobiliareValidation({ error: { fields: ["location_id"] } })).toBe("location_id");
    expect(describeImobiliareValidation({ message: "date invalide" })).toBe("date invalide");
  });
});

/* -------------------------------- locații --------------------------------- */

const SQL_DUMP = `
INSERT INTO locations (id, parent_id, depth, name) VALUES
(1, NULL, 1, 'Bucuresti'),
(2, 1, 2, 'Bucuresti'),
(3, 2, 3, 'Militari'),
(4, 2, 3, 'Drumul Taberei');
`;

describe("nomenclatorul de locații", () => {
  it("parsează dump-ul SQL și denormalizează județul/orașul", () => {
    const parsed = parseImobiliareLocations(SQL_DUMP);
    expect(parsed.rows).toHaveLength(4);
    const rows = denormalizeLocations(parsed.rows);
    const zone = rows.find((row) => row.id === 3);
    expect(zone?.city_name).toBe("Bucuresti");
    expect(zone?.county_name).toBe("Bucuresti");
    expect(zone?.city_normalized).toBeTruthy();
  });

  it("parsează și CSV cu antet", () => {
    const parsed = parseImobiliareLocations("id,parent_id,depth,name\n10,,1,Cluj\n11,10,2,Cluj-Napoca");
    expect(parsed.rows).toHaveLength(2);
  });

  it("potrivește exact cartierul, altfel marchează locația ca aproximativă", () => {
    const candidates = [
      { id: 3, name: "Militari", depth: 3, cityNormalized: "bucuresti", countyNormalized: "bucuresti" },
      { id: 4, name: "Drumul Taberei", depth: 3, cityNormalized: "bucuresti", countyNormalized: "bucuresti" },
    ];
    const exact = matchImobiliareLocation({
      county: "Bucuresti",
      city: "Bucuresti",
      district: "militari",
      candidates,
    });
    expect(exact).toMatchObject({ ok: true, locationId: 3, approximate: false });

    const approximate = matchImobiliareLocation({
      county: "Bucuresti",
      city: "Bucuresti",
      district: "Cartier inexistent",
      candidates,
    });
    expect(approximate).toMatchObject({ ok: true, approximate: true });

    expect(
      matchImobiliareLocation({ county: null, city: "Cluj", district: null, candidates: [] }),
    ).toMatchObject({ ok: false });
  });
});

/* -------------------------------- categorii ------------------------------- */

describe("category_api", () => {
  it("nu inventează valori când catalogul lipsește", () => {
    expect(
      categoryApiFor({ categories: [], fetchedAt: null, error: null }, "apartament", "sale"),
    ).toBeNull();
  });

  it("alege categoria după numele din catalogul portalului", () => {
    const catalog = {
      categories: parseCategories({
        data: [
          { id: 11, name: "Apartamente de vanzare" },
          { id: 12, name: "Apartamente de inchiriere" },
          { id: 20, name: "Case de vanzare" },
        ],
      }),
      fetchedAt: null,
      error: null,
    };
    expect(categoryApiFor(catalog, "apartament", "sale")).toBe(11);
    expect(categoryApiFor(catalog, "apartament", "rent")).toBe(12);
    expect(categoryApiFor(catalog, "casa", "sale")).toBe(20);
  });
});

/* --------------------------------- agenți --------------------------------- */

describe("agenți", () => {
  it("normalizează lista și identificatorul returnat la creare", () => {
    expect(parseAgents({ agents: [{ id: 7, email: "A@B.RO", name: "Ana" }] })).toEqual([
      { id: 7, email: "a@b.ro", name: "Ana" },
    ]);
    expect(agentIdFromCreate({ data: { id: 9 } })).toBe(9);
    expect(agentIdFromCreate({})).toBeNull();
  });
});

/* -------------------------------- imagini --------------------------------- */

describe("loturi de imagini", () => {
  it("limitează atât numărul, cât și dimensiunea totală a lotului", () => {
    const images = Array.from({ length: 7 }, (_, index) => ({
      imageId: String(index),
      bytes: 1000,
      dataUrl: "data:image/jpeg;base64,AAA",
    }));
    expect(batchEncodedImages(images, 5, 1_000_000).map((batch) => batch.length)).toEqual([5, 2]);
    expect(batchEncodedImages(images, 5, 2_500).map((batch) => batch.length)).toEqual([
      2, 2, 2, 1,
    ]);
  });
});

/* ------------------------------ eligibilitate ----------------------------- */

const BASE_INPUT = {
  customReference: "HB-1006",
  agentIds: [5],
  categoryApi: 11,
  locationId: 3,
  title: "Apartament 2 camere Militari",
  description: "x".repeat(120),
  price: 50_000,
  currency: "eur",
  address: "Strada Test 1",
  latitude: 44.434727,
  longitude: 25.987173,
  imageCount: 8,
  propertyType: "apartament",
  layout: null,
  comfort: null,
  buildingType: null,
  buildingStructure: null,
  constructionStage: null,
  buildYear: 1985,
  rooms: 2,
  bedrooms: 1,
  bathrooms: 1,
  floor: 3,
  buildingFloors: 10,
  usableSurface: 52,
  builtSurface: null,
  totalUsableSurface: null,
  balconies: 1,
  terraces: null,
  kitchens: 1,
  garages: null,
  parkingSpaces: 1,
  hasBasement: null,
  hasSemiBasement: null,
  hasGroundFloor: null,
  hasAttic: null,
  petFriendly: true,
  exclusive: null,
  collaboration: true,
  collaborationCommissionPercent: 1.5,
  commission: "2%",
  features: ["balcon"],
  utilities: null,
  buildingAmenities: null,
  heatingSystems: null,
  coolingSystems: null,
  heating: null,
  finishState: null,
  insulation: null,
  wallFinishes: null,
  floorFinishes: null,
  windows: null,
  blinds: null,
  shutters: null,
  entryDoor: null,
  interiorDoors: null,
  additionalSpaces: null,
  kitchenFeatures: null,
  metering: null,
  appliances: null,
  streetArrangement: null,
  furnishing: null,
};

describe("construcția anunțului", () => {
  it("acceptă o ofertă completă și normalizează moneda", () => {
    const built = buildImobiliareListing(BASE_INPUT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.listing.price_currency).toBe("EUR");
    expect(built.listing.location_id).toBe(3);
    expect(built.listing["agents"]).toEqual([5]);
    expect(built.listing.data_properties["pets_allowed"]).toBe(true);
    expect(built.listing.data_properties["collaboration_commission_percentage"]).toBe(1.5);
    // Fără date reale de energie, câmpurile nu sunt trimise.
    expect(built.listing.data_properties["energy_certification_class"]).toBeUndefined();
  });

  it("respinge titlul prea lung, descrierea prea scurtă și coordonatele 0/0", () => {
    const long = buildImobiliareListing({ ...BASE_INPUT, title: "T".repeat(81) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.reasons.join(" ")).toContain("80");

    const short = buildImobiliareListing({ ...BASE_INPUT, description: "prea scurt" });
    expect(short.ok).toBe(false);

    expect(hasRealCoordinates(0, 0)).toBe(false);
    const zero = buildImobiliareListing({ ...BASE_INPUT, latitude: 0, longitude: 0 });
    expect(zero.ok).toBe(false);
  });

  it("blochează publicarea fără categorie, fără agent, fără zonă și fără imagini", () => {
    for (const patch of [
      { categoryApi: null },
      { agentIds: [] },
      { locationId: null },
      { imageCount: 0 },
    ]) {
      const result = buildImobiliareListing({ ...BASE_INPUT, ...patch });
      expect(result.ok).toBe(false);
    }
  });
});
