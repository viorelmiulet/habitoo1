/** VDI.ro — doar mock-uri, fără apeluri reale. */
import { describe, expect, it, vi } from "vitest";
import {
  mapAgentToVdi,
  mapPropertyToVdi,
  mapVdiState,
  parseVdiAgentResponse,
  parseVdiResponse,
  vdiIdIntern,
  vdiAgentFingerprint,
  vdiCounty,
  vdiOfferType,
  type VdiProperty,
} from "./mapper";
import { createVdiAdapter, type VdiDeps } from "../adapters/vdi.server";
import type { PortalContext } from "../adapter";

const base: VdiProperty = {
  reference: "HB-1172",
  externalIdintern: null,
  propertyType: "apartment",
  layout: null,
  title: "Apartament 3 camere Zorilor",
  forSale: true,
  forRent: false,
  salePrice: 145000,
  saleCurrency: "EUR",
  rentPrice: null,
  rentCurrency: null,
  price: null,
  currency: null,
  negotiable: true,
  county: "Cluj",
  city: "Cluj-Napoca",
  district: "Zorilor",
  usableSurface: 68,
  builtSurface: 80.5,
  landSurface: null,
  rooms: 3,
  bathrooms: 1,
  floor: 2,
  floorLabel: null,
  buildingFloors: 4,
  photoUrls: ["https://crm.habitoo.ro/a.jpg", "https://crm.habitoo.ro/b.jpg"],
};

describe("parsarea răspunsului `eroare`", () => {
  it("succes cu ID și link", () => {
    const r = parseVdiResponse({ eroare: "Proprietatea a fost adaugata. ID: VDI126.1262725 | Link: https://vdi.ro/anunt/x" });
    expect(r).toMatchObject({ ok: true, operation: "add", vdiId: "VDI126.1262725", link: "https://vdi.ro/anunt/x" });
    expect(parseVdiResponse({ eroare: "Proprietatea a fost modificata" })).toMatchObject({ ok: true, operation: "mod" });
    expect(parseVdiResponse({ eroare: "Proprietatea a fost stearsa" })).toMatchObject({ ok: true, operation: "del" });
  });
  it("orice alt text e eroare, păstrat cum e", () => {
    expect(parseVdiResponse({ eroare: "Localitatea este invalida" })).toEqual({ ok: false, kind: "rejected", text: "Localitatea este invalida" });
    expect(parseVdiResponse({ eroare: "Cheie invalida" })).toMatchObject({ ok: false, kind: "invalid_key" });
    expect(parseVdiResponse({ eroare: "Abonamentul a expirat" })).toMatchObject({ ok: false, kind: "expired" });
    expect(parseVdiResponse({})).toMatchObject({ ok: false });
  });

  it("cheia nedocumentată `succes` (răspuns real) înseamnă succes", () => {
    const r = parseVdiResponse({ succes: 1000 });
    expect(r).toMatchObject({ ok: true, operation: "add", vdiId: null, link: null });
    expect(parseVdiResponse({ succes: "Proprietatea adaugata. ID: VDI1.9 | Link: https://vdi.ro/y" })).toMatchObject({
      ok: true,
      vdiId: "VDI1.9",
      link: "https://vdi.ro/y",
    });
  });

  it("forma necunoscută arată corpul exact primit (max 200 caractere)", () => {
    const r = parseVdiResponse({ altceva: "x".repeat(500) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.text).toContain('{"altceva":"');
    expect(r.text.length).toBeLessThanOrEqual("Răspuns VDI.ro neașteptat: ".length + 201);
  });
});

describe("parsarea răspunsului agentului", () => {
  it("`{\"succes\":1000}` (răspuns real) → succes", () => {
    expect(parseVdiAgentResponse({ succes: 1000 })).toMatchObject({ ok: true });
    expect(parseVdiAgentResponse({ succes: "ok" })).toMatchObject({ ok: true });
  });
  it("anunț adăugat cu ID și link → succes cu ID și link", () => {
    const r = parseVdiResponse({ eroare: "Proprietatea a fost adaugata. ID: VDI126.1262725 | Link: https://vdi.ro/x" });
    expect(r).toMatchObject({ ok: true, vdiId: "VDI126.1262725", link: "https://vdi.ro/x" });
  });
  it("cheie invalidă și agent negăsit rămân erori", () => {
    expect(parseVdiAgentResponse({ eroare: "Cheie invalida" })).toMatchObject({ ok: false, notFound: false });
    expect(parseVdiAgentResponse({ eroare: "Agentul cu id intern 5 nu a fost gasit" })).toMatchObject({ ok: false, notFound: true });
  });
});

describe("mapper", () => {
  it("idintern = partea numerică fără HB- și fără zerouri la început", () => {
    expect(vdiIdIntern("HB-1172")).toBe(1172);
    expect(vdiIdIntern("HB-0042")).toBe(42);
    expect(vdiIdIntern("fără")).toBeNull();
  });

  it("coduri tip ofertă", () => {
    expect(vdiOfferType("apartment")).toBe(1);
    expect(vdiOfferType("house")).toBe(2);
    expect(vdiOfferType("commercial")).toBe(3);
    expect(vdiOfferType("land")).toBe(4);
    expect(vdiOfferType("industrial")).toBe(5);
    expect(vdiOfferType("office")).toBe(6);
    expect(vdiOfferType("studio")).toBe(7);
    expect(vdiOfferType("hotel")).toBe(8);
  });

  it("construiește payload-ul de vânzare, fără optiuni", () => {
    const r = mapPropertyToVdi(base, 262);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({
      idintern: 1172,
      idagent: 262,
      titlu: "Apartament 3 camere Zorilor",
      tipoferta: 1,
      tipoperatiune: 2,
      judetul: "Cluj",
      localitatea: "Cluj-Napoca",
      cartierul: "Zorilor",
      moneda: 1,
      pretvanzare: 145000,
      negociabil: 1,
      suprafatautila: 68,
      suprafataconstruita: 80.5,
      numarcamere: "3",
      numarbai: "1",
      etajul: "2",
      etaje: "4",
      poze: "https://crm.habitoo.ro/a.jpg,https://crm.habitoo.ro/b.jpg",
    });
    expect(r.payload).not.toHaveProperty("optiuni");
  });

  it("închiriere în RON, parter, titlu scurt completat, București cu sector", () => {
    const r = mapPropertyToVdi(
      { ...base, forSale: false, forRent: true, rentPrice: 2500, rentCurrency: "RON", floor: 0, title: "Studio", city: "București Sectorul 6", district: null, propertyType: "studio" },
      null,
    );
    if (!r.ok) throw new Error("respins");
    expect(r.payload.tipoperatiune).toBe(1);
    expect(r.payload.moneda).toBe(2);
    expect(r.payload.pretinchiriere).toBe(2500);
    expect(r.payload.etajul).toBe("parter");
    expect(r.payload.titlu.length).toBeGreaterThanOrEqual(10);
    expect(r.payload.localitatea).toBe("Bucuresti");
    expect(r.payload.cartierul).toBe("Sector 6");
    expect(r.payload).not.toHaveProperty("idagent");
  });

  it("idintern deja salvat nu se recalculează", () => {
    const r = mapPropertyToVdi({ ...base, externalIdintern: "999", reference: "HB-1" }, null);
    expect(r.ok && r.payload.idintern).toBe(999);
  });

  it("respinge local datele lipsă", () => {
    const r = mapPropertyToVdi({ ...base, county: null, salePrice: null }, null);
    expect(r.ok).toBe(false);
  });

  it("stări sync", () => {
    expect(mapVdiState("activ")).toBe("published");
    for (const s of ["inactiv", "tranzactionat", "sters"]) expect(mapVdiState(s)).toBe("withdrawn");
    expect(mapVdiState("altceva")).toBeNull();
  });

  it("agent fără email → eroare clară", () => {
    expect(mapAgentToVdi({ fullName: "Ana Pop", email: null, phone: null, avatarUrl: null }, 1000).ok).toBe(false);
    const ok = mapAgentToVdi({ fullName: "Andrei Ion Popescu", email: "a@x.ro", phone: "0722", avatarUrl: "https://x/p.jpg" }, 1000);
    expect(ok).toEqual({ ok: true, payload: { idintern: 1000, firstname: "Andrei", lastname: "Ion Popescu", email: "a@x.ro", phone: "0722", photo: "https://x/p.jpg" } });
  });
});

describe("adaptor (mock)", () => {
  const ctx = { organizationId: "org", portalCredential: "k", allowLiveRequests: true, settings: {} } as unknown as PortalContext;
  function deps(agentEmail: string | null, responses: unknown[], link: { externalId: number; synced: boolean; fingerprint?: string | null } = { externalId: 1001, synced: false }) {
    const calls: { endpoint: string; cat: string; body: unknown }[] = [];
    const d: VdiDeps = {
      loadProperty: async () => ({ ok: true, property: base, agent: { userId: "u1", fullName: "Ana Pop", email: agentEmail, phone: null, avatarUrl: null } }),
      agentLink: async () => link,
      markAgentSynced: vi.fn(async () => {}),
      applyRemoteStates: async () => 0,
      call: (async (_k: string, endpoint: string, cat: string, body: unknown) => {
        calls.push({ endpoint, cat, body });
        return { ok: true, status: 200, body: responses.shift() };
      }) as never,
    };
    return { d, calls };
  }

  it("trimite agentul înaintea anunțului și salvează linkul public", async () => {
    const { d, calls } = deps("ana@x.ro", [
      { eroare: "Agentul a fost adaugat" },
      { eroare: "Proprietatea a fost adaugata. ID: VDI1.5 | Link: https://vdi.ro/a/5" },
    ]);
    const out = await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(calls.map((c) => `${c.endpoint}:${c.cat}`)).toEqual(["/api:add", "/apioferte:add"]);
    expect((calls[1]!.body as { idagent: number }).idagent).toBe(1001);
    expect(out.ok && out.data.publicUrl).toBe("https://vdi.ro/a/5");
    expect(out.ok && out.data.externalId).toBe("1172");
  });

  it("agent fără email: eroare înainte de orice trimitere", async () => {
    const { d, calls } = deps(null, []);
    const out = await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("respingerea portalului e afișată cum e, ca eroare finală", async () => {
    const { d } = deps("ana@x.ro", [{ eroare: "Agentul a fost adaugat" }, { eroare: "Localitatea este invalida" }]);
    const out = await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(out).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: "VDI.ro: Localitatea este invalida" });
  });

  it("agent deja trimis, date neschimbate: nu se retrimite", async () => {
    const fp = vdiAgentFingerprint({ idintern: 1001, firstname: "Ana", lastname: "Pop", email: "ana@x.ro" });
    const { d, calls } = deps("ana@x.ro", [{ eroare: "Proprietatea a fost adaugata. ID: VDI1.5 | Link: https://vdi.ro/a/5" }], { externalId: 1001, synced: true, fingerprint: fp });
    const out = await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(calls.map((c) => `${c.endpoint}:${c.cat}`)).toEqual(["/apioferte:add"]);
    expect(out.ok).toBe(true);
  });

  it("mod cu „Date invalide” nu blochează anunțul; avertisment păstrat", async () => {
    const { d, calls } = deps("ana@x.ro", [{ eroare: "Date invalide" }, { eroare: "Proprietatea a fost adaugata. ID: VDI1.5 | Link: https://vdi.ro/a/5" }], { externalId: 1000, synced: true, fingerprint: "vechi" });
    const out = await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(calls.map((c) => `${c.endpoint}:${c.cat}`)).toEqual(["/api:mod", "/apioferte:add"]);
    expect((calls[1]!.body as { idagent: number }).idagent).toBe(1000);
    expect(out.ok && out.data.message).toContain("Date invalide");
  });

  it("mod cu „nu a fost gasit” → add", async () => {
    const { d, calls } = deps("ana@x.ro", [{ eroare: "Agentul cu id intern 1000 nu a fost gasit" }, { succes: 1000 }, { eroare: "Proprietatea a fost adaugata. ID: VDI1.5 | Link: https://vdi.ro/a/5" }], { externalId: 1000, synced: true, fingerprint: null });
    await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(calls.map((c) => `${c.endpoint}:${c.cat}`)).toEqual(["/api:mod", "/api:add", "/apioferte:add"]);
  });
});

describe("adresa VDI.ro (fără trimitere)", () => {
  const addr = (county: string, city: string, district: string | null) => {
    const r = mapPropertyToVdi({ ...base, county, city, district }, 1000);
    return r.ok ? { judetul: r.payload.judetul, localitatea: r.payload.localitatea, cartierul: r.payload.cartierul } : r.reasons;
  };
  it("HB-1175 date reale", () => {
    const out = addr("Bucure\u015fti", "Bucure\u015fti Sectorul 6", "Militari");
    console.log("HB-1175 adresa", JSON.stringify(out));
    expect(out).toEqual({ judetul: "Bucuresti Ilfov", localitatea: "Bucuresti", cartierul: "Militari" });
  });
  it("Sector 6 fără zonă", () => {
    expect(addr("București", "Sector 6", null)).toEqual({ judetul: "Bucuresti Ilfov", localitatea: "Bucuresti", cartierul: "Sector 6" });
  });
  it("Ilfov/Chiajna și Sibiu", () => {
    expect(addr("Ilfov", "Chiajna", null)).toEqual({ judetul: "Bucuresti Ilfov", localitatea: "Chiajna", cartierul: undefined });
    expect(addr("Județul Sibiu", "Sibiu", null)).toMatchObject({ judetul: "Sibiu", localitatea: "Sibiu" });
    expect(addr("Ilfov", "Popești-Leordeni", null)).toMatchObject({ localitatea: "Popesti-Leordeni" });
  });
  it("județe cu cratimă și diacritice", () => {
    expect(vdiCounty("Caraș-Severin")).toBe("Caras Severin");
    expect(vdiCounty("Bistrița-Năsăud")).toBe("Bistrita Nasaud");
    expect(vdiCounty("Dâmbovița")).toBe("Dambovita");
    expect(vdiCounty("Mun. București")).toBe("Bucuresti Ilfov");
  });
  it("județ necunoscut → motiv, fără trimitere", () => {
    expect(addr("Atlantida", "X", null)).toContain("Județul Atlantida nu există în lista VDI.ro");
  });
});

describe("răspunsuri reale anunț HB-1175 (13.10)", () => {
  const url = "https://vdi.ro/apartament-de-vanzare-2-camere-decomandat-militari-residence-1329184.html";
  const first = { id: "VDI720.1329184", url, atentionare: "Una din imaginile trimise nu este valida" };
  const second = { mesaj: "Oferta a fost modificata", ...first };
  it("prima trimitere: succes, operația cerută, atenționare", () => {
    expect(parseVdiResponse(first, "add")).toMatchObject({ ok: true, operation: "add", vdiId: "VDI720.1329184", link: url, warning: "Una din imaginile trimise nu este valida" });
  });
  it("a doua trimitere: operația din mesaj", () => {
    expect(parseVdiResponse(second, "add")).toMatchObject({ ok: true, operation: "mod", vdiId: "VDI720.1329184", link: url });
  });
  it("mesaj fără id, nu de succes → respingere cu textul lui", () => {
    expect(parseVdiResponse({ mesaj: "Date invalide" })).toEqual({ ok: false, text: "Date invalide", kind: "rejected" });
  });
  it("adaptor: publicat cu idintern 1175, link și avertisment", async () => {
    const calls: string[] = [];
    const d: VdiDeps = {
      loadProperty: async () => ({ ok: true, property: { ...base, reference: "HB-1175" }, agent: null }),
      agentLink: async () => ({ externalId: 1, synced: true }),
      markAgentSynced: async () => {},
      applyRemoteStates: async () => 0,
      call: (async (_k: string, e: string, c: string) => { calls.push(`${e}:${c}`); return { ok: true, status: 200, body: first }; }) as never,
    };
    const ctx = { organizationId: "org", portalCredential: "k", allowLiveRequests: true, settings: {} } as unknown as PortalContext;
    const out = await createVdiAdapter(d).publishListing(ctx, { propertyId: "p", externalId: null });
    expect(out.ok && out.data).toMatchObject({ externalId: "1175", publicUrl: url });
    expect(out.ok && out.data.message).toContain("Una din imaginile trimise nu este valida");
  });
  it("retragere fără external_id: cat=del cu idintern din cod; „nu exista” = retras", async () => {
    const bodies: unknown[] = [];
    const d: VdiDeps = {
      loadProperty: async () => ({ ok: false, reasons: [] }),
      loadReference: async () => "HB-1175",
      agentLink: async () => ({ externalId: 1, synced: true }),
      markAgentSynced: async () => {},
      applyRemoteStates: async () => 0,
      call: (async (_k: string, _e: string, c: string, b: unknown) => { bodies.push({ c, b }); return { ok: true, status: 200, body: { eroare: "Proprietatea nu exista" } }; }) as never,
    };
    const ctx = { organizationId: "org", portalCredential: "k", allowLiveRequests: true, settings: {} } as unknown as PortalContext;
    const out = await createVdiAdapter(d).withdrawListing(ctx, { propertyId: "p", externalId: null });
    expect(bodies).toEqual([{ c: "del", b: { idintern: 1175 } }]);
    expect(out.ok && out.data.externalId).toBe("1175");
  });
});
