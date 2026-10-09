/** OLX.ro (cont prepaid) — doar mock-uri, niciun apel real. */
import { describe, expect, it } from "vitest";
import { mapPropertyToOlx, olxPlainText, type OlxProperty } from "./mapper";
import { olxCategoryId, type OlxTaxonomy } from "./taxonomy";
import { checkOlxAdvert, createOlxDirectAdapter, type OlxRequest } from "../adapters/olx-direct.server";
import { PortalError } from "../errors";
import { isForbiddenOlxPurchase } from "./config";
import type { PortalContext } from "../adapter";

const TAX: OlxTaxonomy = {
  "3": { id: 3, name: "Imobiliare", parent_id: 0, photos_limit: 8, is_leaf: false },
  "907": { id: 907, name: "Apartamente - Garsoniere de vanzare", parent_id: 3, photos_limit: 8, is_leaf: false },
  "1165": { id: 1165, name: "2 camere", parent_id: 907, photos_limit: 8, is_leaf: true, attributes: [
    { code: "m", label: "Suprafata utila", required: false, numeric: true, multiple: false, values: [] },
  ] },
  "911": { id: 911, name: "Case de vanzare", parent_id: 3, photos_limit: 8, is_leaf: true, attributes: [
    { code: "rooms", label: "Camere", required: true, numeric: false, multiple: false, values: ["one", "two", "three", "four"] },
  ] },
};

const base = (o: Partial<OlxProperty> = {}): OlxProperty => ({
  reference: "HB-1175",
  propertyType: "apartment",
  title: "Apartament 2 camere Militari, aproape de metrou",
  description: "Apartament luminos cu două camere, balcon închis, bucătărie separată, centrală proprie și loc de parcare în curte.",
  forSale: true, forRent: false, salePrice: 95000, saleCurrency: "EUR", rentPrice: null, rentCurrency: null,
  price: 95000, currency: "EUR", negotiable: true, rooms: 2, usableSurface: 54, landSurface: null,
  lat: 44.43, lng: 26.1, photoUrls: Array.from({ length: 12 }, (_, i) => `https://crm.habitoo.ro/m/${i}`),
  agentName: "Ana Pop", agentPhone: "0722 123 456", ...o,
});

describe("mapper OLX", () => {
  it("construiește payload-ul complet", () => {
    const r = mapPropertyToOlx(base(), TAX, { city_id: 1, district_id: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({ category_id: 1165, advertiser_type: "business", external_id: "HB-1175",
      contact: { name: "Ana Pop", phone: "0722123456" }, price: { value: 95000, currency: "EUR", negotiable: true } });
    expect(r.payload.images).toHaveLength(8);
    expect(r.payload.attributes).toEqual([{ code: "m", value: "54" }]);
  });

  it("titlu prea scurt sau descriere prea scurtă blochează trimiterea", () => {
    const r = mapPropertyToOlx(base({ title: "Apartament", description: "Scurt." }), TAX, { city_id: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.join(" ")).toMatch(/titlul .*minimum 16/);
    expect(r.reasons.join(" ")).toMatch(/descrierea .*minimum 80/);
  });

  it("majusculele peste 50% blochează", () => {
    const r = mapPropertyToOlx(base({ title: "APARTAMENT SUPER OFERTA MILITARI" }), TAX, { city_id: 1 });
    expect(!r.ok && r.reasons.some((x) => /majuscule/.test(x))).toBe(true);
  });

  it("text simplu: fără HTML, telefon, email, link, fără 3 semne la rând", () => {
    const t = olxPlainText("<p>Super!!! Sună la 0722 123 456 sau ana@x.ro, vezi https://x.ro/a</p>");
    expect(t).not.toMatch(/<|0722|@|https|!!!/);
  });

  it("atribut obligatoriu lipsă blochează (Camere la case)", () => {
    const r = mapPropertyToOlx(base({ propertyType: "house", rooms: null }), TAX, { city_id: 1 });
    expect(!r.ok && r.reasons.some((x) => /Camere/.test(x))).toBe(true);
  });

  it("maparea categoriilor folosește ID-urile reale OLX", () => {
    expect(olxCategoryId("studio", "sale", null)).toBe(1163);
    expect(olxCategoryId("apartment", "rent", 5)).toBe(1161);
    expect(olxCategoryId("house", "sale", 3)).toBe(911);
    expect(olxCategoryId("industrial", "rent", null)).toBe(2665);
  });
});

function harness(script: Record<string, (payload?: unknown) => { status: number; body: Record<string, unknown> | null }>, deleted = false) {
  const calls: { method: string; path: string; payload?: unknown }[] = [];
  const errors: string[] = [];
  let armed = 0;
  const request: OlxRequest = async (_o, method, path, payload) => {
    calls.push({ method, path, payload });
    if (method === "POST" && isForbiddenOlxPurchase(method, path)) throw new Error("purchase");
    const key = `${method} ${path.split("?")[0]}`;
    const fn = script[key] ?? (key === "GET /adverts" ? () => ({ status: 200, body: { data: [] } }) : undefined);
    if (!fn) throw new Error(`neașteptat: ${key}`);
    return fn(payload);
  };
  const adapter = createOlxDirectAdapter({
    request,
    loadProperty: async () => ({ ok: true, property: base(), deleted, city: "București", county: "București" }),
    loadTaxonomy: async () => TAX,
    notifyError: async (_o, _p, m) => void errors.push(m),
    armStatusCron: async () => void (armed += 1),
  });
  return { adapter, calls, errors, armed: () => armed };
}

const ctx = { organizationId: "org", allowLiveRequests: true, settings: {} } as unknown as PortalContext;
const loc = () => ({ status: 200, body: { data: [{ city: { id: 1 }, district: { id: 5 } }] } });

describe("adaptor olx_direct", () => {
  it("new → În moderare; abia active → Publicat cu link", async () => {
    let status = "new";
    const h = harness({
      "GET /locations": loc,
      "POST /adverts": () => ({ status: 200, body: { data: { id: 777 } } }),
      "PUT /adverts/777": () => ({ status: 200, body: { data: { id: 777 } } }),
      "GET /adverts/777": () => ({ status: 200, body: { data: { id: 777, status, url: "https://www.olx.ro/d/x", category_id: 1165 } } }),
    });
    const first = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(first.ok && first.data.portalStatus).toBe("pending");
    expect(first.ok && first.data.externalId).toBe("777");
    expect(first.ok && first.data.message).toBe("În moderare OLX");
    expect(h.armed()).toBe(1);
    status = "active";
    const again = await h.adapter.updateListing(ctx, { propertyId: "p", externalId: "777" });
    expect(again.ok && again.data.portalStatus).toBe("updated");
    expect(again.ok && again.data.publicUrl).toBe("https://www.olx.ro/d/x");
  });

  it("limited cu pachet activ → comanda activate, fără nicio cumpărare", async () => {
    const h = harness({
      "GET /locations": loc,
      "POST /adverts": () => ({ status: 200, body: { data: { id: 9 } } }),
      "GET /adverts/9": () => ({ status: 200, body: { data: { status: "limited", category_id: 1165 } } }),
      "GET /users/me/packets": () => ({ status: 200, body: { data: [{ category_id: 3, left: 4 }] } }),
      "POST /adverts/9/commands": () => ({ status: 200, body: null }),
    });
    const r = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(r.ok && r.data.portalStatus).toBe("pending");
    expect(h.calls.find((c) => c.path === "/adverts/9/commands")?.payload).toEqual({ command: "activate" });
    expect(h.calls.some((c) => c.method === "POST" && isForbiddenOlxPurchase(c.method, c.path))).toBe(false);
  });

  it("limited fără pachet → „Necesită pachet OLX”, o singură notificare", async () => {
    const h = harness({
      "GET /locations": loc,
      "POST /adverts": () => ({ status: 200, body: { data: { id: 9 } } }),
      "GET /adverts/9": () => ({ status: 200, body: { data: { status: "unpaid", category_id: 1165 } } }),
      "GET /users/me/packets": () => ({ status: 200, body: { data: [{ category_id: 3, left: 0 }] } }),
    });
    const r = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(r.ok && r.data.portalStatus).toBe("needs_packet");
    expect(r.ok && r.data.message).toBe("Anunțul a fost trimis pe OLX, dar nu e activ: contul OLX nu are pachet pentru categoria 2 camere. Cumpără un pachet din contul OLX, iar Habitoo îl activează automat.");
    expect(h.errors).toHaveLength(1);
    expect(h.armed()).toBe(1);
  });

  it("moderare respinsă → eroare cu motivul OLX", async () => {
    const h = harness({
      "GET /locations": loc,
      "POST /adverts": () => ({ status: 200, body: { data: { id: 9 } } }),
      "GET /adverts/9": () => ({ status: 200, body: { data: { status: "moderated", category_id: 1165 } } }),
      "GET /adverts/9/moderation-reason": () => ({ status: 200, body: { data: { reason: "Fotografii duplicate" } } }),
    });
    const r = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(r.ok && r.data.portalStatus).toBe("error");
    expect(r.ok && r.data.message).toMatch(/Fotografii duplicate/);
  });

  it("retragere = deactivate reversibil; republicare = activate apoi PUT", async () => {
    const h = harness({
      "GET /locations": loc,
      "POST /adverts/5/commands": () => ({ status: 200, body: null }),
      "PUT /adverts/5": () => ({ status: 200, body: { data: { id: 5 } } }),
      "GET /adverts/5": () => ({ status: 200, body: { data: { status: "active", url: "https://www.olx.ro/d/5" } } }),
    });
    const w = await h.adapter.withdrawListing(ctx, { propertyId: "p", externalId: "5" });
    expect(w.ok).toBe(true);
    expect(h.calls[0]).toMatchObject({ method: "POST", path: "/adverts/5/commands", payload: { command: "deactivate", is_success: false } });
    expect(h.calls.some((c) => c.method === "DELETE")).toBe(false);
    h.calls.length = 0;
    const p = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: "5" });
    expect(p.ok && p.data.portalStatus).toBe("published");
    const order = h.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);
    expect(order).toEqual(["POST /adverts/5/commands", "PUT /adverts/5"]);
  });

  it("ștergerea proprietății: deactivate, apoi DELETE", async () => {
    const h = harness({
      "POST /adverts/5/commands": () => ({ status: 200, body: null }),
      "DELETE /adverts/5": () => ({ status: 204, body: null }),
    }, true);
    await h.adapter.withdrawListing(ctx, { propertyId: "p", externalId: "5" });
    expect(h.calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
  });

  it("timeout la POST → găsește anunțul după external_id, fără duplicat", async () => {
    let created = false;
    const h = harness({
      "GET /locations": loc,
      "GET /adverts": () => ({ status: 200, body: { data: created ? [{ id: 42, external_id: "HB-1175" }] : [] } }),
      "POST /adverts": () => { created = true; throw new PortalError("TIMEOUT"); },
      "GET /adverts/42": () => ({ status: 200, body: { data: { status: "new" } } }),
    });
    const r = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(r.ok && r.data.externalId).toBe("42");
    expect(r.ok && r.data.portalStatus).toBe("pending");
    expect(h.calls.filter((c) => c.method === "POST" && c.path === "/adverts")).toHaveLength(1);
  });

  it("anunț existent după external_id → PUT, nu POST nou", async () => {
    const h = harness({
      "GET /locations": loc,
      "GET /adverts": () => ({ status: 200, body: { data: [{ id: 42, external_id: "HB-1175" }] } }),
      "PUT /adverts/42": () => ({ status: 200, body: { data: { id: 42 } } }),
      "GET /adverts/42": () => ({ status: 200, body: { data: { status: "active", url: "https://www.olx.ro/d/42" } } }),
    });
    const r = await h.adapter.publishListing(ctx, { propertyId: "p", externalId: null });
    expect(r.ok && r.data.externalId).toBe("42");
    expect(h.calls.some((c) => c.method === "POST" && c.path === "/adverts")).toBe(false);
  });

  it("după apariția pachetului → activate, apoi active = Publicat", async () => {
    let status = "limited";
    let packets: unknown[] = [];
    const calls: string[] = [];
    const request: OlxRequest = async (_o, method, path) => {
      calls.push(`${method} ${path.split("?")[0]}`);
      if (method === "GET" && path.startsWith("/adverts/9")) return { status: 200, body: { data: { status, category_id: 1165, url: "https://www.olx.ro/d/9" } } };
      if (path.startsWith("/users/me/packets")) return { status: 200, body: { data: packets } };
      if (method === "POST" && path === "/adverts/9/commands") { status = "active"; return { status: 200, body: null }; }
      throw new Error(path);
    };
    expect((await checkOlxAdvert(request, "org", "9", TAX)).portalStatus).toBe("needs_packet");
    packets = [{ category_id: 3, left: 2 }];
    expect((await checkOlxAdvert(request, "org", "9", TAX)).portalStatus).toBe("pending");
    expect(calls).toContain("POST /adverts/9/commands");
    const done = await checkOlxAdvert(request, "org", "9", TAX);
    expect(done).toMatchObject({ portalStatus: "published", url: "https://www.olx.ro/d/9" });
  });
});

describe("descriere OLX", () => {
  it("se termină cu „Cod ofertă: HB-…” și rămâne în 9000 de caractere", () => {
    const r = mapPropertyToOlx(base(), TAX, { city_id: 1 });
    expect(r.ok && r.payload.description.endsWith("\n\nCod ofertă: HB-1175")).toBe(true);
    const long = mapPropertyToOlx(base({ description: "Apartament frumos. ".repeat(600) }), TAX, { city_id: 1 });
    expect(long.ok && long.payload.description.length).toBeLessThanOrEqual(9000);
    expect(long.ok && long.payload.description.endsWith("Cod ofertă: HB-1175")).toBe(true);
  });
});
