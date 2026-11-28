import { describe, expect, it } from "vitest";
import { encodeHomezzForm, homezzPost, type HomezzResult, type HomezzValue } from "./client";
import { HomezzPublishError, homezzInternalId, homezzLajumateDue, homezzPhotosHash, parseHomezzAdInfo, parseHomezzOffers, publishHomezz, withdrawHomezz, type HomezzOffer, type HomezzPublishClient } from "./publish";
import { createHomezzAdapter, type HomezzListingData } from "../adapters/homezz.server";
import { homezzImages } from "./listing.server";

type Call = { scope: "agency" | "agent"; action: string; params: Record<string, HomezzValue> };
const ok = (data: unknown = {}): HomezzResult => ({ ok: true, status: 200, message: "", data, raw: "" });
const notFound: HomezzResult = { ok: false, kind: "action_error", status: 400, message: "Anuntul nu exista", adError: null, retryable: false, raw: "" };

function fake(responses: Partial<Record<string, (p: Record<string, HomezzValue>) => HomezzResult>> = {}) {
  const calls: Call[] = [];
  const run = (scope: Call["scope"]) => async (action: string, params: Record<string, HomezzValue>) => {
    calls.push({ scope, action, params });
    const r = responses[action];
    if (r) return r(params);
    if (action === "ad-info") return notFound;
    if (action === "insert") return ok({ url: `https://homezz.ro/a-${String(params["internal_id"])}.html`, id: `H${String(params["internal_id"])}` });
    return ok({});
  };
  const client: HomezzPublishClient = { agency: run("agency"), agent: run("agent") };
  return { client, calls, actions: () => calls.map((c) => `${c.action}:${String(c.params["internal_id"] ?? "")}`) };
}
const ads = (...t: ("sale" | "rent")[]) => t.map((transaction) => ({ transaction, params: { category: 1, title: "Apartament", price: 100 } }));
const images = (n: number) => ({ ids: Array.from({ length: n }, (_, i) => `img${i}`), urls: Array.from({ length: n }, (_, i) => `https://crm.habitoo.ro/api/public/sites/v1/media/img${i}.jpg?w=1024&h=768&fit=contain`) });
const offer = (tx: "sale" | "rent", extra: Partial<HomezzOffer> = {}): HomezzOffer => {
  const internal = homezzInternalId("HB-1376", tx)!;
  return { transaction: tx, reference: internal, internal_id: internal, id: `H${internal}`, homezz_id: `H${internal}`, url: `https://homezz.ro/a-${internal}.html`, ljm_url: null, agent_email: "a@x.ro", photos_hash: homezzPhotosHash(images(3).ids), deleted: false, ...extra };
};

describe("HomeZZ publish", () => {
  it.each([[], {}, { deleted: false }, null])("ad-info fără identificator (%j) → insert", async (ad) => {
    expect(parseHomezzAdInfo(ok({ ad })).exists).toBe(false);
    const f = fake({ "ad-info": () => ok({ ad }) });
    await publishHomezz({ ads: ads("sale"), stored: [], reference: "HB-1649", agentEmail: "a@x.ro", images: images(3), client: f.client });
    expect(f.actions()).toEqual(["ad-info:16491", "insert:16491"]);
  });

  it.each(["internal_id", "id", "homezz_url"])("ad-info cu %s → update", async (identifier) => {
    const f = fake({ "ad-info": () => ok({ ad: { [identifier]: identifier === "homezz_url" ? "https://homezz.ro/x.html" : "16491" } }) });
    await publishHomezz({ ads: ads("sale"), stored: [], reference: "HB-1649", agentEmail: "a@x.ro", images: images(3), client: f.client });
    expect(f.actions()).toEqual(["ad-info:16491", "update:16491"]);
  });

  const missingId: HomezzResult = { ok: false, kind: "action_error", status: 400, message: "Modify error", adError: JSON.stringify({ internal_id: "Acest ID nu exista in baza noastra de date." }), retryable: false, raw: "" };
  it.each([false, true])("ID inexistent → un insert și ofertă înlocuită (salvată=%s)", async (saved) => {
    const f = fake({ "ad-info": () => ok({ ad: { internal_id: "13761" } }), update: () => missingId });
    const r = await publishHomezz({ ads: ads("sale"), stored: saved ? [offer("sale", { url: "https://homezz.ro/old.html", homezz_id: "old", ljm_url: "https://lajumate.ro/old.html" })] : [], reference: "HB-1376", agentEmail: "a@x.ro", images: images(3), client: f.client });
    expect(f.actions()).toEqual(saved ? ["update:13761", "insert:13761"] : ["ad-info:13761", "update:13761", "insert:13761"]);
    const update = f.calls.find((c) => c.action === "update");
    const insert = f.calls.find((c) => c.action === "insert");
    expect(insert?.params).toEqual({ ...update?.params, images: images(3).urls });
    expect(r.offers).toHaveLength(1);
    expect(r.offers[0]?.url).toBe("https://homezz.ro/a-13761.html");
    expect(r.offers[0]?.homezz_id).toBe("H13761");
    expect(r.offers[0]?.ljm_url).toBeNull();
  });

  it("insert de rezervă eșuat → fără buclă", async () => {
    const f = fake({ update: () => missingId, insert: () => missingId });
    await expect(publishHomezz({ ads: ads("sale"), stored: [offer("sale")], reference: "HB-1376", agentEmail: "a@x.ro", images: images(3), client: f.client })).rejects.toMatchObject({ action: "insert", result: missingId });
    expect(f.actions()).toEqual(["update:13761", "insert:13761"]);
  });

  it.each([false, true])("altă eroare update se propagă neschimbată (salvată=%s)", async (saved) => {
    const rejected: HomezzResult = { ...missingId, adError: JSON.stringify({ title: "ID nu exista în titlu" }) };
    const f = fake({ "ad-info": () => ok({ ad: { internal_id: "13761" } }), update: () => rejected });
    const run = publishHomezz({ ads: ads("sale"), stored: saved ? [offer("sale")] : [], reference: "HB-1376", agentEmail: "a@x.ro", images: images(3), client: f.client });
    await expect(run).rejects.toBeInstanceOf(HomezzPublishError);
    await expect(run).rejects.toMatchObject({ action: "update", result: rejected });
    expect(f.calls.filter((c) => c.action === "insert")).toHaveLength(0);
  });
  it("prima publicare vânzare + închiriere → două insert cu …1 și …2", async () => {
    const f = fake();
    const r = await publishHomezz({ ads: ads("sale", "rent"), stored: [], reference: "HB-1376", agentEmail: "a@x.ro", images: images(3), client: f.client });
    expect(f.calls.filter((c) => c.action === "insert").map((c) => c.params["internal_id"])).toEqual(["13761", "13762"]);
    expect(f.calls.filter((c) => c.action === "ad-info").every((c) => c.scope === "agency")).toBe(true);
    expect(r.offers.map((o) => o.internal_id)).toEqual(["13761", "13762"]);
    expect(r.offers[0]!.url).toBe("https://homezz.ro/a-13761.html");
  });

  it("anunț găsit de ad-info → update, fără insert", async () => {
    const f = fake({ "ad-info": () => ok({ ad: { homezz_url: "https://homezz.ro/x.html", ljm_url: "https://lajumate.ro/x.html", deleted: false } }) });
    const r = await publishHomezz({ ads: ads("sale"), stored: [], reference: "HB-1376", agentEmail: "a@x.ro", images: images(2), client: f.client });
    expect(f.actions()).toEqual(["ad-info:13761", "update:13761"]);
    expect(r.offers[0]!.url).toBe("https://homezz.ro/x.html");
    expect(r.offers[0]!.ljm_url).toBe("https://lajumate.ro/x.html");
  });

  it("anunț dezactivat găsit de ad-info → activate apoi update", async () => {
    const f = fake({ "ad-info": () => ok({ ad: { homezz_url: "https://homezz.ro/x.html", deleted: 1 } }) });
    await publishHomezz({ ads: ads("sale"), stored: [], reference: "HB-1376", agentEmail: "a@x.ro", images: images(2), client: f.client });
    expect(f.actions()).toEqual(["ad-info:13761", "activate:13761", "update:13761"]);
  });

  it("actualizare fără poze schimbate → fără images", async () => {
    const f = fake();
    await publishHomezz({ ads: ads("sale"), stored: [offer("sale")], reference: "HB-1376", agentEmail: "a@x.ro", images: images(3), client: f.client });
    expect(f.actions()).toEqual(["update:13761"]);
    expect("images" in f.calls[0]!.params).toBe(false);
  });

  it("poze schimbate → images[0..17]", async () => {
    const f = fake();
    await publishHomezz({ ads: ads("sale"), stored: [offer("sale")], reference: "HB-1376", agentEmail: "a@x.ro", images: images(25), client: f.client });
    const body = encodeHomezzForm(f.calls[0]!.params);
    expect(body).toContain(encodeURIComponent("images[0]"));
    expect(body).toContain(encodeURIComponent("images[17]"));
    expect(body).not.toContain(encodeURIComponent("images[18]"));
  });

  it("toate pozele șterse → images= gol", async () => {
    const f = fake();
    await publishHomezz({ ads: ads("sale"), stored: [offer("sale")], reference: "HB-1376", agentEmail: "a@x.ro", images: { ids: [], urls: [] }, client: f.client });
    expect(encodeHomezzForm(f.calls[0]!.params)).toMatch(/(^|&)images=(&|$)/);
  });

  it("agent schimbat → move-ad apoi update", async () => {
    const f = fake();
    const r = await publishHomezz({ ads: ads("sale"), stored: [offer("sale")], reference: "HB-1376", agentEmail: "b@x.ro", images: images(3), client: f.client });
    expect(f.calls.map((c) => `${c.scope}:${c.action}`)).toEqual(["agency:move-ad", "agent:update"]);
    expect(f.calls[0]!.params["email"]).toBe("b@x.ro");
    expect(r.offers[0]!.agent_email).toBe("b@x.ro");
  });

  it("renunțare la închiriere → delete doar pe …2", async () => {
    const f = fake();
    const r = await publishHomezz({ ads: ads("sale"), stored: [offer("sale"), offer("rent")], reference: "HB-1376", agentEmail: "a@x.ro", images: images(3), client: f.client });
    expect(f.actions()).toEqual(["update:13761", "delete:13762"]);
    expect(r.offers.find((o) => o.transaction === "rent")!.deleted).toBe(true);
  });

  it("retragere idempotentă: deja dezactivat/inexistent = succes, fără apeluri repetate", async () => {
    const f = fake({ delete: () => notFound });
    const r = await withdrawHomezz({ stored: [offer("sale"), offer("rent", { deleted: true })], agentEmail: "a@x.ro", client: f.client });
    expect(f.actions()).toEqual(["delete:13761", "ad-info:13761"]);
    expect(r.offers.every((o) => o.deleted)).toBe(true);
    const again = fake();
    await withdrawHomezz({ stored: r.offers, agentEmail: "a@x.ro", client: again.client });
    expect(again.calls).toEqual([]);
  });

  it("eroare cu ad_error păstrată exact", async () => {
    const transport = async () => new Response(JSON.stringify({ meta: { code: 400, message: "Eroare la adaugare" }, data: { ad_error: { title: "Titlul contine cuvinte interzise" } } }), { status: 400 });
    const r = await homezzPost("insert", { token: "tok-9f3a2c", internal_id: "13761" }, transport);
    const f = fake({ insert: () => r });
    await expect(publishHomezz({ ads: ads("sale"), stored: [], reference: "HB-1376", agentEmail: "a@x.ro", images: images(1), client: f.client }))
      .rejects.toThrow('Eroare la adaugare — {"title":"Titlul contine cuvinte interzise"}');
  });

  it("Lajumate: cel puțin 10 minute de la publicare, cel mult o dată pe minut", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    expect(homezzLajumateDue(offer("sale", { published_at: "2026-11-24T11:55:00Z" }), now)).toBe(false);
    expect(homezzLajumateDue(offer("sale", { published_at: "2026-11-24T11:40:00Z" }), now)).toBe(true);
    expect(homezzLajumateDue(offer("sale", { published_at: "2026-11-24T11:40:00Z", ljm_checked_at: "2026-11-24T11:59:30Z" }), now)).toBe(false);
  });

  it("imagini: primele 18, redimensionate la 1024×768 fără decupare", () => {
    const r = homezzImages(Array.from({ length: 20 }, (_, i) => `https://crm.habitoo.ro/api/public/sites/v1/media/id${i}.jpg`));
    expect(r.urls).toHaveLength(18);
    expect(r.ids[0]).toBe("id0");
    expect(r.urls[0]).toBe("https://crm.habitoo.ro/api/public/sites/v1/media/id0.jpg?w=1024&h=768&fit=contain");
  });

  it("parseHomezzOffers păstrează internal_id salvat", () => {
    expect(parseHomezzOffers([{ transaction: "sale", internal_id: "99991", reference: "99991", id: "H1", url: "" }])[0]!.internal_id).toBe("99991");
  });
});

describe("HomeZZ adapter", () => {
  const base: HomezzListingData = { mapping: { ok: true, ads: ads("sale"), warnings: [] }, reference: "HB-1376", assignedTo: "u1", agentEmail: "a@x.ro", stored: [], images: { ...images(1), warnings: [] } };
  const ctx = { organizationId: "o1", portalCredential: "SECRET-KEY", allowLiveRequests: true } as never;

  it.each([false, true])("jurnal cu ad-info update insert și răspunsuri redactate (eșec=%s)", async (failed) => {
    const transport = async (url: string) => {
      const action = url.split("/").pop();
      if (action === "ad-info") return new Response(JSON.stringify({ meta: { code: 200 }, data: { ad: { internal_id: "13761" }, key: "SECRET-KEY", token: "OTHER-TOKEN" } }));
      if (action === "update") return new Response(JSON.stringify({ meta: { code: 400, message: "Modify error" }, data: { ad_error: { internal_id: "Acest ID nu exista in baza noastra de date." } } }), { status: 400 });
      return new Response(JSON.stringify({ meta: { code: failed ? 400 : 200, message: failed ? "Insert error" : "ok" }, data: { id: 9, url: "https://homezz.ro/new.html", token: "SECRET-TOKEN" } }), { status: failed ? 400 : 200 });
    };
    const a = createHomezzAdapter(transport, { load: async () => base, withToken: async (_o, _e, run) => run("SECRET-TOKEN") });
    if (!a.publishListing) throw new Error("Missing publishListing");
    const r = await a.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(!failed);
    const response = (r.ok ? r.data.portalResponse : r.portalResponse) as { actions: string[]; responses: { action: string; body: string }[] };
    expect(response.actions).toEqual(["ad-info", "update", "insert"]);
    expect(response.responses[0]?.body).toContain('"internal_id":"13761"');
    expect(r.ok ? r.data.httpStatus : r.httpStatus).toBe(failed ? 400 : 200);
    if (r.ok) expect(r.data.offers?.[0]?.id).toBe("9");
    const logged = JSON.stringify(r);
    expect(logged).not.toContain("SECRET-KEY");
    expect(logged).not.toContain("SECRET-TOKEN");
    expect(logged).not.toContain("OTHER-TOKEN");
  });

  it("agent neactivat → niciun apel", async () => {
    const sent: string[] = [];
    const a = createHomezzAdapter(async (url) => { sent.push(url); return new Response("{}"); }, { load: async () => ({ ...base, agentEmail: null }), withToken: async (_o, _e, run) => run("TOKEN") });
    const r = await a.publishListing!(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Agentul responsabil nu este activat pe HomeZZ.");
    expect(sent).toEqual([]);
  });

  it("token și cheie absente din jurnal și mesaje", async () => {
    const bodies: string[] = [];
    const transport = async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      const action = _url.split("/").pop();
      if (action === "ad-info") return new Response(JSON.stringify({ meta: { code: 400, message: "nu exista" }, data: {} }), { status: 400 });
      return new Response(JSON.stringify({ meta: { code: 400, message: "Token SECRET-TOKEN invalid key=SECRET-KEY" }, data: { ad_error: "token SECRET-TOKEN" } }), { status: 400 });
    };
    const a = createHomezzAdapter(transport, { load: async () => base, withToken: async (_o, _e, run) => run("SECRET-TOKEN") });
    const r = await a.publishListing!(ctx, { propertyId: "p1", externalId: null });
    expect(bodies.some((b) => b.includes("SECRET-TOKEN"))).toBe(true);
    const logged = JSON.stringify(r);
    expect(logged).not.toContain("SECRET-TOKEN");
    expect(logged).not.toContain("SECRET-KEY");
  });

  it("publicare reușită salvează ofertele și linkul HomeZZ primit", async () => {
    const transport = async (url: string) => {
      const action = url.split("/").pop();
      if (action === "ad-info") return new Response(JSON.stringify({ meta: { code: 400, message: "nu exista" }, data: {} }), { status: 400 });
      return new Response(JSON.stringify({ meta: { code: 200, message: "ok" }, data: { url: "https://homezz.ro/a.html", id: 5, internal_id: "13761" } }), { status: 200 });
    };
    const a = createHomezzAdapter(transport, { load: async () => base, withToken: async (_o, _e, run) => run("T") });
    const r = await a.publishListing!(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok && r.data.publicUrl).toBe("https://homezz.ro/a.html");
    expect(r.ok && r.data.offers?.[0]?.reference).toBe("13761");
  });
});
