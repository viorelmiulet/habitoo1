import { describe, expect, it } from "vitest";
import type { VumsiAttribute, VumsiCategory } from "./nomenclature";
import {
  VUMSI_SETUP_MESSAGE,
  mapPropertyToVumsi,
  matchVumsiChoice,
  pickVumsiCity,
  suggestVumsiCategory,
  suggestVumsiType,
  vumsiExternalId,
  vumsiListingTypes,
  type VumsiMappings,
} from "./mapper";
import { buildVumsiPreview } from "./preview.server";

const cat = (id: number, name: string): VumsiCategory => ({ id, name, path: `Imobiliare > ${name}`, parent: 1, query: "" });
const CATS = [cat(461, "Apartamente - Garsoniere - Penthouse"), cat(73, "Case - Vile"), cat(74, "Terenuri"), cat(75, "Birouri - Spatii comerciale")];
const REFERENCE = { listing_types: [{ value: 1, code: "sell", label: "Vânzare" }, { value: 2, code: "buy", label: "Cumpărare" }, { value: 3, code: "rent", label: "Închiriere" }] };
const f = (name: string, type: string, extra: Partial<VumsiAttribute> = {}): VumsiAttribute => ({ name, label: null, type, required: false, choices: [], ...extra });
const APT_FIELDS = [
  f("property_type", "choice", { label: "Tip proprietate", choices: [{ value: "single_room", label: "Garsonieră" }, { value: "apartment", label: "Apartament" }, { value: "penthouse", label: "Penthouse" }] }),
  f("bedrooms", "number"), f("usable_area", "decimal", { required: true, label: "Suprafață utilă (m2)" }),
  f("partitioning", "choice", { choices: [{ value: "detached", label: "Decomandat" }, { value: "not_detached", label: "Nedecomandat" }] }),
  f("floor", "choice", { choices: [{ value: "ground_floor", label: "Parter" }, { value: "1", label: "1" }, { value: "10_plus", label: "10+" }] }),
  f("furnished", "choice", { choices: [{ value: "yes", label: "Da" }, { value: "no", label: "Nu" }, { value: "partial", label: "Parțial" }] }),
];
const ATTRS = {
  "461": { fields: APT_FIELDS },
  "73": { fields: [f("rooms", "number", { required: true, label: "Camere" }), f("land_area", "decimal")] },
  "74": { fields: [f("total_area", "decimal", { required: true, label: "Suprafața totală (m2)" })] },
};
const MAPPINGS: VumsiMappings = {
  categories: ["sale", "rent"].flatMap((tx) => [
    { habitoo_kind: "apartment", transaction: tx as "sale", category_id: 461, category_name: "Apartamente" },
    { habitoo_kind: "studio", transaction: tx as "sale", category_id: 461, category_name: "Apartamente" },
    { habitoo_kind: "house", transaction: tx as "sale", category_id: 73, category_name: "Case - Vile" },
    { habitoo_kind: "land", transaction: tx as "sale", category_id: 74, category_name: "Terenuri" },
  ]),
  types: [{ transaction: "sale", type_value: 1 }, { transaction: "rent", type_value: 3 }],
};
const ctx = { attributes: ATTRS, mappings: MAPPINGS, cityId: 681290 };
const base = { id: "p1", title: "Titlu", description: "Descriere", assigned_to: "u1", sale_price: 100000, rent_price: 500, sale_currency: "EUR", rent_currency: "RON" } as const;

describe.each([
  ["apartment", { rooms: 2, usable_surface: 55, layout: "Decomandat", floor: 0, furnishing: "Nemobilat" }, 461],
  ["studio", { rooms: 1, usable_surface: 30 }, 461],
  ["house", { rooms: 4, land_surface: 300 }, 73],
  ["land", { land_surface: 1200 }, 74],
])("%s", (type, extra, category) => {
  for (const tx of ["sale", "rent"] as const) {
    it(`la ${tx}: categorie, tip, preț și external_id`, () => {
      const r = mapPropertyToVumsi({ ...base, property_type: type, for_sale: tx === "sale", for_rent: tx === "rent", ...extra }, ctx);
      expect(r.reasons).toEqual([]);
      const b = r.plans[0]!.body!;
      expect(b.category).toBe(category);
      expect(b.type).toBe(tx === "sale" ? 1 : 3);
      expect(b.price).toEqual(tx === "sale" ? { amount: 100000, currency: "EUR" } : { amount: 500, currency: "RON" });
      expect(b.external_id).toBe(`HBT-p1-${tx === "sale" ? "V" : "I"}`);
      expect(b.location).toEqual({ city_id: 681290 });
      expect(Object.keys(b.attrs).every((k) => ATTRS[String(category) as "461"].fields.some((x) => x.name === k))).toBe(true);
    });
  }
});

describe("mapper Vumsi", () => {
  it("valorile din listă se aleg dintre cele permise, fără diacritice", () => {
    const r = mapPropertyToVumsi({ ...base, property_type: "apartment", for_sale: true, usable_surface: 55, layout: "Decomandat", floor: 0, furnishing: "Parțial" }, ctx);
    expect(r.plans[0]!.attrs).toMatchObject({ property_type: "apartment", partitioning: "detached", floor: "ground_floor", furnished: "partial", usable_area: 55 });
    expect(matchVumsiChoice("garsoniera", APT_FIELDS[0]!.choices)).toBe("single_room");
    expect(matchVumsiChoice("Fără sens", APT_FIELDS[0]!.choices)).toBeNull();
    expect(matchVumsiChoice(14 > 10 ? "10+" : 14, APT_FIELDS[4]!.choices)).toBe("10_plus");
  });

  it("dual = două anunțuri", () => {
    const r = mapPropertyToVumsi({ ...base, property_type: "apartment", for_sale: true, for_rent: true, usable_surface: 60 }, ctx);
    expect(r.plans.map((x) => x.body?.external_id)).toEqual(["HBT-p1-V", "HBT-p1-I"]);
  });

  it("atribut obligatoriu lipsă = blocare, cu mesajul câmpului", () => {
    const r = mapPropertyToVumsi({ ...base, property_type: "land", for_sale: true }, ctx);
    expect(r.plans[0]!.body).toBeNull();
    expect(r.reasons.join(" ")).toContain("Completează „Suprafața totală (m2)”");
  });

  it("external_id stabil", () => {
    expect(vumsiExternalId("abc", "sale")).toBe("HBT-abc-V");
    expect(vumsiExternalId("abc", "rent")).toBe("HBT-abc-I");
    const a = mapPropertyToVumsi({ ...base, property_type: "apartment", for_sale: true, usable_surface: 50, title: "Alt titlu" }, ctx);
    expect(a.plans[0]!.externalId).toBe("HBT-p1-V");
  });

  it("lipsa corespondenței = blocare", () => {
    const r = mapPropertyToVumsi({ ...base, property_type: "office", for_sale: true }, ctx);
    expect(r.plans[0]!.body).toBeNull();
    expect(r.reasons.join(" ")).toContain(VUMSI_SETUP_MESSAGE);
    const noType = mapPropertyToVumsi({ ...base, property_type: "apartment", for_rent: true, usable_surface: 50 }, { ...ctx, mappings: { ...MAPPINGS, types: [] } });
    expect(noType.plans[0]!.body).toBeNull();
  });

  it("fără city_id nu se construiește anunțul", () => {
    const r = mapPropertyToVumsi({ ...base, property_type: "apartment", for_sale: true, usable_surface: 50 }, { ...ctx, cityId: null });
    expect(r.plans[0]!.body).toBeNull();
  });

  it("sugestii după nume pentru categorii și tip", () => {
    expect(suggestVumsiCategory("studio", "sale", CATS)?.id).toBe(461);
    expect(suggestVumsiCategory("house", "rent", CATS)?.id).toBe(73);
    expect(suggestVumsiCategory("office", "sale", CATS)?.id).toBe(75);
    expect(suggestVumsiCategory("industrial", "sale", CATS)).toBeNull();
    const types = vumsiListingTypes(REFERENCE);
    expect(suggestVumsiType("sale", types)?.value).toBe(1);
    expect(suggestVumsiType("rent", types)?.value).toBe(3);
  });

  it("alege orașul după nume și județ", () => {
    const list = [{ id: 1, name: "Florești", region: "Județul Cluj" }, { id: 2, name: "Florești", region: "Județul Prahova" }];
    expect(pickVumsiCity(list, "Florești", "Prahova")?.id).toBe(2);
    expect(pickVumsiCity(list, "Florești", null)).toBeNull();
  });
});

describe("previzualizare Vumsi", () => {
  function fakeDb(tables: Record<string, unknown>) {
    const q = (name: string): any => {
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: Array.isArray(tables[name]) ? (tables[name] as unknown[])[0] ?? null : tables[name] ?? null }),
        upsert: async () => ({ error: null }),
        then: (res: (v: unknown) => void) => res({ data: tables[name] ?? [] }),
      };
      return chain;
    };
    return { from: q };
  }

  it("fără snapshot sau corespondențe: mesajul de configurare, fără apeluri", async () => {
    const r = await buildVumsiPreview("p1", { db: fakeDb({}), get: null });
    expect(r.setupMissing).toBe(true);
    expect(r.reasons).toEqual([VUMSI_SETUP_MESSAGE]);
  });

  it("doar GET-uri: oraș nearest, utilizator/companie după ID-ul nostru; payloaduri complete", async () => {
    const calls: string[] = [];
    const get = async (path: string) => {
      calls.push(path);
      if (path.includes("nearest")) return { ok: true as const, data: { id: 681290, name: "Cluj-Napoca" } as any };
      if (path.startsWith("/users/")) return { ok: true as const, data: { uuid: "11111111-1111-1111-1111-111111111111" } as any };
      return { ok: false as const, kind: "not_found", message: "nu" };
    };
    const db = fakeDb({
      vumsi_nomenclature_snapshots: { reference: REFERENCE, categories: CATS, attributes: ATTRS },
      vumsi_category_mappings: MAPPINGS.categories,
      vumsi_type_mappings: MAPPINGS.types,
      properties: { ...base, organization_id: "o1", property_type: "apartment", for_sale: true, usable_surface: 50, lat: 46.77, lng: 23.59, location_precise: true, city: "Cluj-Napoca" },
      organizations: { id: "o1", name: "Agenția X", cui: "RO1", city: "Cluj-Napoca", registered_address: "Str. 1" },
      profiles: { id: "u1", full_name: "Ana Pop", email: "ana@x.ro", phone: "07" },
    });
    const r = await buildVumsiPreview("p1", { db, get });
    expect(r.reasons).toEqual([]);
    expect(r.cityId).toBe(681290);
    expect(r.plans[0]!.body?.external_user_id).toBe("u1");
    expect(r.user.payload).toMatchObject({ first_name: "Ana", last_name: "Pop", external_user_id: "u1" });
    expect(r.company.payload).toMatchObject({ external_company_id: "o1", company_number: "RO1", country: "RO", owner: { user_uuid: "11111111-1111-1111-1111-111111111111" } });
    expect(r.company.vumsiUuid).toBeNull();
    expect(calls).toEqual(["/locations/cities/nearest/", "/users/by-external-id/u1/", "/companies/by-external-id/o1/"]);
  });
});
